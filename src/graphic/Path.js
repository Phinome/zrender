/**
 * Path element
 * @module zrender/graphic/Path
 *
 * TODO adjustRect for resize and centering
 */

define(function (require) {

    var Displayable = require('./Displayable');
    var zrUtil = require('../core/util');
    var PathProxy = require('../core/PathProxy');
    var pathContain = require('../contain/path');

    function pathHasFill(style) {
        var fill = style.fill;
        return fill != null && fill !== 'none';
    }

    function pathHasStroke(style) {
        var stroke = style.stroke;
        return stroke != null && stroke !== 'none';
    }

    var abs = Math.abs;
    function getLineScale(m) {
        return m && abs(m[0] - 1) > 1e-10 && abs(m[3] - 1) > 1e-10
            ? Math.sqrt(abs(m[0] * m[3] - m[2] * m[1]))
            : 1;
    }

    /**
     * @alias module:zrender/graphic/Path
     * @extends module:zrender/graphic/Displayable
     * @constructor
     * @param {Object} opts
     */
    var Path = function (opts) {
        Displayable.call(this, opts);

        /**
         * @type {module:zrender/core/PathProxy}
         * @readOnly
         */
        this.path = new PathProxy();
    };

    Path.prototype = {

        constructor: Path,

        type: 'path',

        __dirtyPath: true,

        brush: function (ctx) {
            this.beforeBrush(ctx);

            var style = this.style;

            var path = this.path;
            var hasStroke = pathHasStroke(style);
            var hasFill = pathHasFill(style);

            var lineDash = style.lineDash;
            var lineDashOffset = style.lineDashOffset;

            var ctxLineDash = !!ctx.setLineDash;
            // Proxy context
            // Rebuild path in following 2 cases
            // 1. Path is dirty
            // 2. Path needs javascript implemented lineDash stroking.
            //    In this case, lineDash information will not be saved in PathProxy
            if (this.__dirtyPath || (
                lineDash && !ctxLineDash && hasStroke
            )) {
                path = this.path.beginPath(ctx);

                // Setting line dash before build path
                if (lineDash && !ctxLineDash) {
                    path.setLineDash(lineDash);
                    path.setLineDashOffset(lineDashOffset);
                }

                this.buildPath(path, this.shape);

                // Clear path dirty flag
                this.__dirtyPath = false;
            }
            else {
                // Replay path building
                ctx.beginPath();
                this.path.rebuildPath(ctx);
            }

            hasFill && path.fill(ctx);

            if (lineDash && ctxLineDash) {
                ctx.setLineDash(lineDash);
                ctx.lineDashOffset = lineDashOffset;
            }

            hasStroke && path.stroke(ctx);

            // Draw rect text
            if (style.text) {
                this.drawRectText(ctx, this.getBoundingRect());
            }

            this.afterBrush(ctx);
        },

        buildPath: function (ctx, shapeCfg) {},

        getBoundingRect: function () {
            if (! this._rect) {
                if (this.__dirtyPath) {
                    this.buildPath(this.path, this.shape);
                }
                this._rect = this.path.getBoundingRect();

                if (pathHasStroke(this.style)) {
                    var rect = this._rect;
                    // FIXME Must after updateTransform
                    var w = this.style.lineWidth;

                    // Consider line width
                    rect.width += w;
                    rect.height += w;
                    rect.x -= w / 2;
                    rect.y -= w / 2;
                }
            }
            return this._rect;
        },

        contain: function (x, y) {
            var localPos = this.transformCoordToLocal(x, y);
            var rect = this.getBoundingRect();
            var style = this.style;
            x = localPos[0];
            y = localPos[1];

            if (rect.contain(x, y)) {
                var pathData = this.path.data;
                if (pathHasStroke(style)) {
                    var lineWidth = style.lineWidth;
                    var lineScale = getLineScale(this.transform);
                    lineWidth = Math.max(lineWidth * lineScale, 5) / lineScale;
                    if (pathContain.containStroke(
                        pathData, lineWidth, x, y
                    )) {
                        return true;
                    }
                }
                if (pathHasFill(style)) {
                    return pathContain.contain(pathData, x, y);
                }
            }
            return false;
        },

        /**
         * @param  {boolean} dirtyPath
         */
        dirty: function (dirtyPath) {
            if (arguments.length ===0) {
                dirtyPath = true;
            }
            // Only mark dirty, not mark clean
            if (dirtyPath) {
                this.__dirtyPath = dirtyPath;
                this._rect = null;
            }

            this.__dirty = true;

            this.__zr && this.__zr.refresh();

            // Used as a clipping path
            if (this.__clipTarget) {
                this.__clipTarget.dirty();
            }
        },

        /**
         * Alias for animate('shape')
         * @param {boolean} loop
         */
        animateShape: function (loop) {
            return this.animate('shape', loop);
        },

        // Overwrite attrKV
        attrKV: function (key, value) {
            Displayable.prototype.attrKV.call(this, key, value);
            // Is a shape
            if (key === 'shape' && this.shape) {
                this.__dirtyPath = true;
                this._rect = null;
            }
        }
    };

    /**
     * 扩展一个 Path element, 比如星形，圆等。
     * Extend a path element
     * @param {Object} props
     * @param {string} props.type Path type
     * @param {Function} props.init Initialize
     * @param {Function} props.buildPath Overwrite buildPath method
     * @param {Object} [props.style] Extended default style config
     * @param {Object} [props.shape] Extended default shape config
     */
    Path.extend = function (defaults) {
        var Sub = function (opts) {
            Path.call(this, opts);

            if (defaults.style) {
                // Extend default style
                this.style.extendFrom(defaults.style, false);
            }

            // Extend default shape
            var defaultShape = defaults.shape;
            if (defaultShape) {
                this.shape = this.shape || {};
                var thisShape = this.shape;
                for (var name in defaultShape) {
                    if (
                        ! thisShape.hasOwnProperty(name)
                        && defaultShape.hasOwnProperty(name)
                    ) {
                        thisShape[name] = defaultShape[name];
                    }
                }
            }

            defaults.init && defaults.init.call(this, opts);
        };

        zrUtil.inherits(Sub, Path);

        // FIXME 不能 extend position, rotation 等引用对象
        for (var name in defaults) {
            // Extending prototype values and methods
            if (name !== 'style' && name !== 'shape') {
                Sub.prototype[name] = defaults[name];
            }
        }

        return Sub;
    };

    zrUtil.inherits(Path, Displayable);

    return Path;
});