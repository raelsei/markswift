var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  if (mod && typeof mod === "object" || typeof mod === "function") {
    for (let key of __getOwnPropNames(mod))
      if (!__hasOwnProp.call(to, key))
        __defProp(to, key, {
          get: __accessProp.bind(mod, key),
          enumerable: true
        });
  }
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

// node_modules/svgpath/lib/path_parse.js
var require_path_parse = __commonJS(function(exports, module) {
  var paramCounts = { a: 7, c: 6, h: 1, l: 2, m: 2, r: 4, q: 4, s: 4, t: 2, v: 1, z: 0 };
  var SPECIAL_SPACES = [
    5760,
    6158,
    8192,
    8193,
    8194,
    8195,
    8196,
    8197,
    8198,
    8199,
    8200,
    8201,
    8202,
    8239,
    8287,
    12288,
    65279
  ];
  function isSpace(ch) {
    return ch === 10 || ch === 13 || ch === 8232 || ch === 8233 || ch === 32 || ch === 9 || ch === 11 || ch === 12 || ch === 160 || ch >= 5760 && SPECIAL_SPACES.indexOf(ch) >= 0;
  }
  function isCommand(code) {
    switch (code | 32) {
      case 109:
      case 122:
      case 108:
      case 104:
      case 118:
      case 99:
      case 115:
      case 113:
      case 116:
      case 97:
      case 114:
        return true;
    }
    return false;
  }
  function isArc(code) {
    return (code | 32) === 97;
  }
  function isDigit(code) {
    return code >= 48 && code <= 57;
  }
  function isDigitStart(code) {
    return code >= 48 && code <= 57 || code === 43 || code === 45 || code === 46;
  }
  function State(path) {
    this.index = 0;
    this.path = path;
    this.max = path.length;
    this.result = [];
    this.param = 0;
    this.err = "";
    this.segmentStart = 0;
    this.data = [];
  }
  function skipSpaces(state) {
    while (state.index < state.max && isSpace(state.path.charCodeAt(state.index))) {
      state.index++;
    }
  }
  function scanFlag(state) {
    var ch = state.path.charCodeAt(state.index);
    if (ch === 48) {
      state.param = 0;
      state.index++;
      return;
    }
    if (ch === 49) {
      state.param = 1;
      state.index++;
      return;
    }
    state.err = "SvgPath: arc flag can be 0 or 1 only (at pos " + state.index + ")";
  }
  function scanParam(state) {
    var start = state.index, index = start, max = state.max, zeroFirst = false, hasCeiling = false, hasDecimal = false, hasDot = false, ch;
    if (index >= max) {
      state.err = "SvgPath: missed param (at pos " + index + ")";
      return;
    }
    ch = state.path.charCodeAt(index);
    if (ch === 43 || ch === 45) {
      index++;
      ch = index < max ? state.path.charCodeAt(index) : 0;
    }
    if (!isDigit(ch) && ch !== 46) {
      state.err = "SvgPath: param should start with 0..9 or `.` (at pos " + index + ")";
      return;
    }
    if (ch !== 46) {
      zeroFirst = ch === 48;
      index++;
      ch = index < max ? state.path.charCodeAt(index) : 0;
      if (zeroFirst && index < max) {
        if (ch && isDigit(ch)) {
          state.err = "SvgPath: numbers started with `0` such as `09` are illegal (at pos " + start + ")";
          return;
        }
      }
      while (index < max && isDigit(state.path.charCodeAt(index))) {
        index++;
        hasCeiling = true;
      }
      ch = index < max ? state.path.charCodeAt(index) : 0;
    }
    if (ch === 46) {
      hasDot = true;
      index++;
      while (isDigit(state.path.charCodeAt(index))) {
        index++;
        hasDecimal = true;
      }
      ch = index < max ? state.path.charCodeAt(index) : 0;
    }
    if (ch === 101 || ch === 69) {
      if (hasDot && !hasCeiling && !hasDecimal) {
        state.err = "SvgPath: invalid float exponent (at pos " + index + ")";
        return;
      }
      index++;
      ch = index < max ? state.path.charCodeAt(index) : 0;
      if (ch === 43 || ch === 45) {
        index++;
      }
      if (index < max && isDigit(state.path.charCodeAt(index))) {
        while (index < max && isDigit(state.path.charCodeAt(index))) {
          index++;
        }
      } else {
        state.err = "SvgPath: invalid float exponent (at pos " + index + ")";
        return;
      }
    }
    state.index = index;
    state.param = parseFloat(state.path.slice(start, index)) + 0;
  }
  function finalizeSegment(state) {
    var cmd, cmdLC;
    cmd = state.path[state.segmentStart];
    cmdLC = cmd.toLowerCase();
    var params = state.data;
    if (cmdLC === "m" && params.length > 2) {
      state.result.push([cmd, params[0], params[1]]);
      params = params.slice(2);
      cmdLC = "l";
      cmd = cmd === "m" ? "l" : "L";
    }
    if (cmdLC === "r") {
      state.result.push([cmd].concat(params));
    } else {
      while (params.length >= paramCounts[cmdLC]) {
        state.result.push([cmd].concat(params.splice(0, paramCounts[cmdLC])));
        if (!paramCounts[cmdLC]) {
          break;
        }
      }
    }
  }
  function scanSegment(state) {
    var max = state.max, cmdCode, is_arc, comma_found, need_params, i;
    state.segmentStart = state.index;
    cmdCode = state.path.charCodeAt(state.index);
    is_arc = isArc(cmdCode);
    if (!isCommand(cmdCode)) {
      state.err = "SvgPath: bad command " + state.path[state.index] + " (at pos " + state.index + ")";
      return;
    }
    need_params = paramCounts[state.path[state.index].toLowerCase()];
    state.index++;
    skipSpaces(state);
    state.data = [];
    if (!need_params) {
      finalizeSegment(state);
      return;
    }
    comma_found = false;
    for (;; ) {
      for (i = need_params;i > 0; i--) {
        if (is_arc && (i === 3 || i === 4))
          scanFlag(state);
        else
          scanParam(state);
        if (state.err.length) {
          finalizeSegment(state);
          return;
        }
        state.data.push(state.param);
        skipSpaces(state);
        comma_found = false;
        if (state.index < max && state.path.charCodeAt(state.index) === 44) {
          state.index++;
          skipSpaces(state);
          comma_found = true;
        }
      }
      if (comma_found) {
        continue;
      }
      if (state.index >= state.max) {
        break;
      }
      if (!isDigitStart(state.path.charCodeAt(state.index))) {
        break;
      }
    }
    finalizeSegment(state);
  }
  module.exports = function pathParse(svgPath) {
    var state = new State(svgPath);
    var max = state.max;
    skipSpaces(state);
    while (state.index < max && !state.err.length) {
      scanSegment(state);
    }
    if (state.result.length) {
      if ("mM".indexOf(state.result[0][0]) < 0) {
        state.err = "SvgPath: string should start with `M` or `m`";
        state.result = [];
      } else {
        state.result[0][0] = "M";
      }
    }
    return {
      err: state.err,
      segments: state.result
    };
  };
});

// node_modules/svgpath/lib/matrix.js
var require_matrix = __commonJS(function(exports, module) {
  function combine(m1, m2) {
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
  }
  function Matrix() {
    if (!(this instanceof Matrix)) {
      return new Matrix;
    }
    this.queue = [];
    this.cache = null;
  }
  Matrix.prototype.matrix = function(m) {
    if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0) {
      return this;
    }
    this.cache = null;
    this.queue.push(m);
    return this;
  };
  Matrix.prototype.translate = function(tx, ty) {
    if (tx !== 0 || ty !== 0) {
      this.cache = null;
      this.queue.push([1, 0, 0, 1, tx, ty]);
    }
    return this;
  };
  Matrix.prototype.scale = function(sx, sy) {
    if (sx !== 1 || sy !== 1) {
      this.cache = null;
      this.queue.push([sx, 0, 0, sy, 0, 0]);
    }
    return this;
  };
  Matrix.prototype.rotate = function(angle, rx, ry) {
    var rad, cos, sin;
    if (angle !== 0) {
      this.translate(rx, ry);
      rad = angle * Math.PI / 180;
      cos = Math.cos(rad);
      sin = Math.sin(rad);
      this.queue.push([cos, sin, -sin, cos, 0, 0]);
      this.cache = null;
      this.translate(-rx, -ry);
    }
    return this;
  };
  Matrix.prototype.skewX = function(angle) {
    if (angle !== 0) {
      this.cache = null;
      this.queue.push([1, 0, Math.tan(angle * Math.PI / 180), 1, 0, 0]);
    }
    return this;
  };
  Matrix.prototype.skewY = function(angle) {
    if (angle !== 0) {
      this.cache = null;
      this.queue.push([1, Math.tan(angle * Math.PI / 180), 0, 1, 0, 0]);
    }
    return this;
  };
  Matrix.prototype.toArray = function() {
    if (this.cache) {
      return this.cache;
    }
    if (!this.queue.length) {
      this.cache = [1, 0, 0, 1, 0, 0];
      return this.cache;
    }
    this.cache = this.queue[0];
    if (this.queue.length === 1) {
      return this.cache;
    }
    for (var i = 1;i < this.queue.length; i++) {
      this.cache = combine(this.cache, this.queue[i]);
    }
    return this.cache;
  };
  Matrix.prototype.calc = function(x, y, isRelative) {
    var m;
    if (!this.queue.length) {
      return [x, y];
    }
    if (!this.cache) {
      this.cache = this.toArray();
    }
    m = this.cache;
    return [
      x * m[0] + y * m[2] + (isRelative ? 0 : m[4]),
      x * m[1] + y * m[3] + (isRelative ? 0 : m[5])
    ];
  };
  module.exports = Matrix;
});

// node_modules/svgpath/lib/transform_parse.js
var require_transform_parse = __commonJS(function(exports, module) {
  var Matrix = require_matrix();
  var operations = {
    matrix: true,
    scale: true,
    rotate: true,
    translate: true,
    skewX: true,
    skewY: true
  };
  var CMD_SPLIT_RE = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(\s*(.+?)\s*\)[\s,]*/;
  var PARAMS_SPLIT_RE = /[\s,]+/;
  module.exports = function transformParse(transformString) {
    var matrix = new Matrix;
    var cmd, params;
    transformString.split(CMD_SPLIT_RE).forEach(function(item) {
      if (!item.length) {
        return;
      }
      if (typeof operations[item] !== "undefined") {
        cmd = item;
        return;
      }
      params = item.split(PARAMS_SPLIT_RE).map(function(i) {
        return +i || 0;
      });
      switch (cmd) {
        case "matrix":
          if (params.length === 6) {
            matrix.matrix(params);
          }
          return;
        case "scale":
          if (params.length === 1) {
            matrix.scale(params[0], params[0]);
          } else if (params.length === 2) {
            matrix.scale(params[0], params[1]);
          }
          return;
        case "rotate":
          if (params.length === 1) {
            matrix.rotate(params[0], 0, 0);
          } else if (params.length === 3) {
            matrix.rotate(params[0], params[1], params[2]);
          }
          return;
        case "translate":
          if (params.length === 1) {
            matrix.translate(params[0], 0);
          } else if (params.length === 2) {
            matrix.translate(params[0], params[1]);
          }
          return;
        case "skewX":
          if (params.length === 1) {
            matrix.skewX(params[0]);
          }
          return;
        case "skewY":
          if (params.length === 1) {
            matrix.skewY(params[0]);
          }
          return;
      }
    });
    return matrix;
  };
});

// node_modules/svgpath/lib/a2c.js
var require_a2c = __commonJS(function(exports, module) {
  var TAU = Math.PI * 2;
  function unit_vector_angle(ux, uy, vx, vy) {
    var sign = ux * vy - uy * vx < 0 ? -1 : 1;
    var dot = ux * vx + uy * vy;
    if (dot > 1) {
      dot = 1;
    }
    if (dot < -1) {
      dot = -1;
    }
    return sign * Math.acos(dot);
  }
  function get_arc_center(x1, y1, x2, y2, fa, fs, rx, ry, sin_phi, cos_phi) {
    var x1p = cos_phi * (x1 - x2) / 2 + sin_phi * (y1 - y2) / 2;
    var y1p = -sin_phi * (x1 - x2) / 2 + cos_phi * (y1 - y2) / 2;
    var rx_sq = rx * rx;
    var ry_sq = ry * ry;
    var x1p_sq = x1p * x1p;
    var y1p_sq = y1p * y1p;
    var radicant = rx_sq * ry_sq - rx_sq * y1p_sq - ry_sq * x1p_sq;
    if (radicant < 0) {
      radicant = 0;
    }
    radicant /= rx_sq * y1p_sq + ry_sq * x1p_sq;
    radicant = Math.sqrt(radicant) * (fa === fs ? -1 : 1);
    var cxp = radicant * rx / ry * y1p;
    var cyp = radicant * -ry / rx * x1p;
    var cx = cos_phi * cxp - sin_phi * cyp + (x1 + x2) / 2;
    var cy = sin_phi * cxp + cos_phi * cyp + (y1 + y2) / 2;
    var v1x = (x1p - cxp) / rx;
    var v1y = (y1p - cyp) / ry;
    var v2x = (-x1p - cxp) / rx;
    var v2y = (-y1p - cyp) / ry;
    var theta1 = unit_vector_angle(1, 0, v1x, v1y);
    var delta_theta = unit_vector_angle(v1x, v1y, v2x, v2y);
    if (fs === 0 && delta_theta > 0) {
      delta_theta -= TAU;
    }
    if (fs === 1 && delta_theta < 0) {
      delta_theta += TAU;
    }
    return [cx, cy, theta1, delta_theta];
  }
  function approximate_unit_arc(theta1, delta_theta) {
    var alpha = 4 / 3 * Math.tan(delta_theta / 4);
    var x1 = Math.cos(theta1);
    var y1 = Math.sin(theta1);
    var x2 = Math.cos(theta1 + delta_theta);
    var y2 = Math.sin(theta1 + delta_theta);
    return [x1, y1, x1 - y1 * alpha, y1 + x1 * alpha, x2 + y2 * alpha, y2 - x2 * alpha, x2, y2];
  }
  module.exports = function a2c(x1, y1, x2, y2, fa, fs, rx, ry, phi) {
    var sin_phi = Math.sin(phi * TAU / 360);
    var cos_phi = Math.cos(phi * TAU / 360);
    var x1p = cos_phi * (x1 - x2) / 2 + sin_phi * (y1 - y2) / 2;
    var y1p = -sin_phi * (x1 - x2) / 2 + cos_phi * (y1 - y2) / 2;
    if (x1p === 0 && y1p === 0) {
      return [];
    }
    if (rx === 0 || ry === 0) {
      return [];
    }
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    var lambda = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
    if (lambda > 1) {
      rx *= Math.sqrt(lambda);
      ry *= Math.sqrt(lambda);
    }
    var cc = get_arc_center(x1, y1, x2, y2, fa, fs, rx, ry, sin_phi, cos_phi);
    var result = [];
    var theta1 = cc[2];
    var delta_theta = cc[3];
    var segments = Math.max(Math.ceil(Math.abs(delta_theta) / (TAU / 4)), 1);
    delta_theta /= segments;
    for (var i = 0;i < segments; i++) {
      result.push(approximate_unit_arc(theta1, delta_theta));
      theta1 += delta_theta;
    }
    return result.map(function(curve) {
      for (var i = 0;i < curve.length; i += 2) {
        var x = curve[i + 0];
        var y = curve[i + 1];
        x *= rx;
        y *= ry;
        var xp = cos_phi * x - sin_phi * y;
        var yp = sin_phi * x + cos_phi * y;
        curve[i + 0] = xp + cc[0];
        curve[i + 1] = yp + cc[1];
      }
      return curve;
    });
  };
});

// node_modules/svgpath/lib/ellipse.js
var require_ellipse = __commonJS(function(exports, module) {
  var epsilon = 0.0000000001;
  var torad = Math.PI / 180;
  function Ellipse(rx, ry, ax) {
    if (!(this instanceof Ellipse)) {
      return new Ellipse(rx, ry, ax);
    }
    this.rx = rx;
    this.ry = ry;
    this.ax = ax;
  }
  Ellipse.prototype.transform = function(m) {
    var c = Math.cos(this.ax * torad), s = Math.sin(this.ax * torad);
    var ma = [
      this.rx * (m[0] * c + m[2] * s),
      this.rx * (m[1] * c + m[3] * s),
      this.ry * (-m[0] * s + m[2] * c),
      this.ry * (-m[1] * s + m[3] * c)
    ];
    var J = ma[0] * ma[0] + ma[2] * ma[2], K = ma[1] * ma[1] + ma[3] * ma[3];
    var D = ((ma[0] - ma[3]) * (ma[0] - ma[3]) + (ma[2] + ma[1]) * (ma[2] + ma[1])) * ((ma[0] + ma[3]) * (ma[0] + ma[3]) + (ma[2] - ma[1]) * (ma[2] - ma[1]));
    var JK = (J + K) / 2;
    if (D < epsilon * JK) {
      this.rx = this.ry = Math.sqrt(JK);
      this.ax = 0;
      return this;
    }
    var L = ma[0] * ma[1] + ma[2] * ma[3];
    D = Math.sqrt(D);
    var l1 = JK + D / 2, l2 = JK - D / 2;
    this.ax = Math.abs(L) < epsilon && Math.abs(l1 - K) < epsilon ? 90 : Math.atan(Math.abs(L) > Math.abs(l1 - K) ? (l1 - J) / L : L / (l1 - K)) * 180 / Math.PI;
    if (this.ax >= 0) {
      this.rx = Math.sqrt(l1);
      this.ry = Math.sqrt(l2);
    } else {
      this.ax += 90;
      this.rx = Math.sqrt(l2);
      this.ry = Math.sqrt(l1);
    }
    return this;
  };
  Ellipse.prototype.isDegenerate = function() {
    return this.rx < epsilon * this.ry || this.ry < epsilon * this.rx;
  };
  module.exports = Ellipse;
});

// node_modules/svgpath/lib/svgpath.js
var require_svgpath = __commonJS(function(exports, module) {
  var pathParse = require_path_parse();
  var transformParse = require_transform_parse();
  var matrix = require_matrix();
  var a2c = require_a2c();
  var ellipse = require_ellipse();
  function SvgPath(path) {
    if (!(this instanceof SvgPath)) {
      return new SvgPath(path);
    }
    var pstate = pathParse(path);
    this.segments = pstate.segments;
    this.err = pstate.err;
    this.__stack = [];
  }
  SvgPath.from = function(src) {
    if (typeof src === "string")
      return new SvgPath(src);
    if (src instanceof SvgPath) {
      var s = new SvgPath("");
      s.err = src.err;
      s.segments = src.segments.map(function(sgm) {
        return sgm.slice();
      });
      s.__stack = src.__stack.map(function(m) {
        return matrix().matrix(m.toArray());
      });
      return s;
    }
    throw new Error("SvgPath.from: invalid param type " + src);
  };
  SvgPath.prototype.__matrix = function(m) {
    var self = this, i;
    if (!m.queue.length) {
      return;
    }
    this.iterate(function(s, index, x, y) {
      var p, result, name, isRelative;
      switch (s[0]) {
        case "v":
          p = m.calc(0, s[1], true);
          result = p[0] === 0 ? ["v", p[1]] : ["l", p[0], p[1]];
          break;
        case "V":
          p = m.calc(x, s[1], false);
          result = p[0] === m.calc(x, y, false)[0] ? ["V", p[1]] : ["L", p[0], p[1]];
          break;
        case "h":
          p = m.calc(s[1], 0, true);
          result = p[1] === 0 ? ["h", p[0]] : ["l", p[0], p[1]];
          break;
        case "H":
          p = m.calc(s[1], y, false);
          result = p[1] === m.calc(x, y, false)[1] ? ["H", p[0]] : ["L", p[0], p[1]];
          break;
        case "a":
        case "A":
          var ma = m.toArray();
          var e = ellipse(s[1], s[2], s[3]).transform(ma);
          if (ma[0] * ma[3] - ma[1] * ma[2] < 0) {
            s[5] = s[5] ? "0" : "1";
          }
          p = m.calc(s[6], s[7], s[0] === "a");
          if (s[0] === "A" && s[6] === x && s[7] === y || s[0] === "a" && s[6] === 0 && s[7] === 0) {
            result = [s[0] === "a" ? "l" : "L", p[0], p[1]];
            break;
          }
          if (e.isDegenerate()) {
            result = [s[0] === "a" ? "l" : "L", p[0], p[1]];
          } else {
            result = [s[0], e.rx, e.ry, e.ax, s[4], s[5], p[0], p[1]];
          }
          break;
        case "m":
          isRelative = index > 0;
          p = m.calc(s[1], s[2], isRelative);
          result = ["m", p[0], p[1]];
          break;
        default:
          name = s[0];
          result = [name];
          isRelative = name.toLowerCase() === name;
          for (i = 1;i < s.length; i += 2) {
            p = m.calc(s[i], s[i + 1], isRelative);
            result.push(p[0], p[1]);
          }
      }
      self.segments[index] = result;
    }, true);
  };
  SvgPath.prototype.__evaluateStack = function() {
    var m, i;
    if (!this.__stack.length) {
      return;
    }
    if (this.__stack.length === 1) {
      this.__matrix(this.__stack[0]);
      this.__stack = [];
      return;
    }
    m = matrix();
    i = this.__stack.length;
    while (--i >= 0) {
      m.matrix(this.__stack[i].toArray());
    }
    this.__matrix(m);
    this.__stack = [];
  };
  SvgPath.prototype.toString = function() {
    var result = "", prevCmd = "", cmdSkipped = false;
    this.__evaluateStack();
    for (var i = 0, len = this.segments.length;i < len; i++) {
      var segment = this.segments[i];
      var cmd = segment[0];
      if (cmd !== prevCmd || cmd === "m" || cmd === "M") {
        if (cmd === "m" && prevCmd === "z")
          result += " ";
        result += cmd;
        cmdSkipped = false;
      } else {
        cmdSkipped = true;
      }
      for (var pos = 1;pos < segment.length; pos++) {
        var val = segment[pos];
        if (pos === 1) {
          if (cmdSkipped && val >= 0)
            result += " ";
        } else if (val >= 0)
          result += " ";
        result += val;
      }
      prevCmd = cmd;
    }
    return result;
  };
  SvgPath.prototype.translate = function(x, y) {
    this.__stack.push(matrix().translate(x, y || 0));
    return this;
  };
  SvgPath.prototype.scale = function(sx, sy) {
    this.__stack.push(matrix().scale(sx, !sy && sy !== 0 ? sx : sy));
    return this;
  };
  SvgPath.prototype.rotate = function(angle, rx, ry) {
    this.__stack.push(matrix().rotate(angle, rx || 0, ry || 0));
    return this;
  };
  SvgPath.prototype.skewX = function(degrees) {
    this.__stack.push(matrix().skewX(degrees));
    return this;
  };
  SvgPath.prototype.skewY = function(degrees) {
    this.__stack.push(matrix().skewY(degrees));
    return this;
  };
  SvgPath.prototype.matrix = function(m) {
    this.__stack.push(matrix().matrix(m));
    return this;
  };
  SvgPath.prototype.transform = function(transformString) {
    if (!transformString.trim()) {
      return this;
    }
    this.__stack.push(transformParse(transformString));
    return this;
  };
  SvgPath.prototype.round = function(d) {
    var contourStartDeltaX = 0, contourStartDeltaY = 0, deltaX = 0, deltaY = 0, l;
    d = d || 0;
    this.__evaluateStack();
    this.segments.forEach(function(s) {
      var isRelative = s[0].toLowerCase() === s[0];
      switch (s[0]) {
        case "H":
        case "h":
          if (isRelative) {
            s[1] += deltaX;
          }
          deltaX = s[1] - s[1].toFixed(d);
          s[1] = +s[1].toFixed(d);
          return;
        case "V":
        case "v":
          if (isRelative) {
            s[1] += deltaY;
          }
          deltaY = s[1] - s[1].toFixed(d);
          s[1] = +s[1].toFixed(d);
          return;
        case "Z":
        case "z":
          deltaX = contourStartDeltaX;
          deltaY = contourStartDeltaY;
          return;
        case "M":
        case "m":
          if (isRelative) {
            s[1] += deltaX;
            s[2] += deltaY;
          }
          deltaX = s[1] - s[1].toFixed(d);
          deltaY = s[2] - s[2].toFixed(d);
          contourStartDeltaX = deltaX;
          contourStartDeltaY = deltaY;
          s[1] = +s[1].toFixed(d);
          s[2] = +s[2].toFixed(d);
          return;
        case "A":
        case "a":
          if (isRelative) {
            s[6] += deltaX;
            s[7] += deltaY;
          }
          deltaX = s[6] - s[6].toFixed(d);
          deltaY = s[7] - s[7].toFixed(d);
          s[1] = +s[1].toFixed(d);
          s[2] = +s[2].toFixed(d);
          s[3] = +s[3].toFixed(d + 2);
          s[6] = +s[6].toFixed(d);
          s[7] = +s[7].toFixed(d);
          return;
        default:
          l = s.length;
          if (isRelative) {
            s[l - 2] += deltaX;
            s[l - 1] += deltaY;
          }
          deltaX = s[l - 2] - s[l - 2].toFixed(d);
          deltaY = s[l - 1] - s[l - 1].toFixed(d);
          s.forEach(function(val, i) {
            if (!i) {
              return;
            }
            s[i] = +s[i].toFixed(d);
          });
          return;
      }
    });
    return this;
  };
  SvgPath.prototype.iterate = function(iterator, keepLazyStack) {
    var segments = this.segments, replacements = {}, needReplace = false, lastX = 0, lastY = 0, countourStartX = 0, countourStartY = 0;
    var i, j, newSegments;
    if (!keepLazyStack) {
      this.__evaluateStack();
    }
    segments.forEach(function(s, index) {
      var res = iterator(s, index, lastX, lastY);
      if (Array.isArray(res)) {
        replacements[index] = res;
        needReplace = true;
      }
      var isRelative = s[0] === s[0].toLowerCase();
      switch (s[0]) {
        case "m":
        case "M":
          lastX = s[1] + (isRelative ? lastX : 0);
          lastY = s[2] + (isRelative ? lastY : 0);
          countourStartX = lastX;
          countourStartY = lastY;
          return;
        case "h":
        case "H":
          lastX = s[1] + (isRelative ? lastX : 0);
          return;
        case "v":
        case "V":
          lastY = s[1] + (isRelative ? lastY : 0);
          return;
        case "z":
        case "Z":
          lastX = countourStartX;
          lastY = countourStartY;
          return;
        default:
          lastX = s[s.length - 2] + (isRelative ? lastX : 0);
          lastY = s[s.length - 1] + (isRelative ? lastY : 0);
      }
    });
    if (!needReplace) {
      return this;
    }
    newSegments = [];
    for (i = 0;i < segments.length; i++) {
      if (typeof replacements[i] !== "undefined") {
        for (j = 0;j < replacements[i].length; j++) {
          newSegments.push(replacements[i][j]);
        }
      } else {
        newSegments.push(segments[i]);
      }
    }
    this.segments = newSegments;
    return this;
  };
  SvgPath.prototype.abs = function() {
    this.iterate(function(s, index, x, y) {
      var name = s[0], nameUC = name.toUpperCase(), i;
      if (name === nameUC) {
        return;
      }
      s[0] = nameUC;
      switch (name) {
        case "v":
          s[1] += y;
          return;
        case "a":
          s[6] += x;
          s[7] += y;
          return;
        default:
          for (i = 1;i < s.length; i++) {
            s[i] += i % 2 ? x : y;
          }
      }
    }, true);
    return this;
  };
  SvgPath.prototype.rel = function() {
    this.iterate(function(s, index, x, y) {
      var name = s[0], nameLC = name.toLowerCase(), i;
      if (name === nameLC) {
        return;
      }
      if (index === 0 && name === "M") {
        return;
      }
      s[0] = nameLC;
      switch (name) {
        case "V":
          s[1] -= y;
          return;
        case "A":
          s[6] -= x;
          s[7] -= y;
          return;
        default:
          for (i = 1;i < s.length; i++) {
            s[i] -= i % 2 ? x : y;
          }
      }
    }, true);
    return this;
  };
  SvgPath.prototype.unarc = function() {
    this.iterate(function(s, index, x, y) {
      var new_segments, nextX, nextY, result = [], name = s[0];
      if (name !== "A" && name !== "a") {
        return null;
      }
      if (name === "a") {
        nextX = x + s[6];
        nextY = y + s[7];
      } else {
        nextX = s[6];
        nextY = s[7];
      }
      new_segments = a2c(x, y, nextX, nextY, s[4], s[5], s[1], s[2], s[3]);
      if (new_segments.length === 0) {
        return [[s[0] === "a" ? "l" : "L", s[6], s[7]]];
      }
      new_segments.forEach(function(s) {
        result.push(["C", s[2], s[3], s[4], s[5], s[6], s[7]]);
      });
      return result;
    });
    return this;
  };
  SvgPath.prototype.unshort = function() {
    var segments = this.segments;
    var prevControlX, prevControlY, prevSegment;
    var curControlX, curControlY;
    this.iterate(function(s, idx, x, y) {
      var name = s[0], nameUC = name.toUpperCase(), isRelative;
      if (!idx) {
        return;
      }
      if (nameUC === "T") {
        isRelative = name === "t";
        prevSegment = segments[idx - 1];
        if (prevSegment[0] === "Q") {
          prevControlX = prevSegment[1] - x;
          prevControlY = prevSegment[2] - y;
        } else if (prevSegment[0] === "q") {
          prevControlX = prevSegment[1] - prevSegment[3];
          prevControlY = prevSegment[2] - prevSegment[4];
        } else {
          prevControlX = 0;
          prevControlY = 0;
        }
        curControlX = -prevControlX;
        curControlY = -prevControlY;
        if (!isRelative) {
          curControlX += x;
          curControlY += y;
        }
        segments[idx] = [
          isRelative ? "q" : "Q",
          curControlX,
          curControlY,
          s[1],
          s[2]
        ];
      } else if (nameUC === "S") {
        isRelative = name === "s";
        prevSegment = segments[idx - 1];
        if (prevSegment[0] === "C") {
          prevControlX = prevSegment[3] - x;
          prevControlY = prevSegment[4] - y;
        } else if (prevSegment[0] === "c") {
          prevControlX = prevSegment[3] - prevSegment[5];
          prevControlY = prevSegment[4] - prevSegment[6];
        } else {
          prevControlX = 0;
          prevControlY = 0;
        }
        curControlX = -prevControlX;
        curControlY = -prevControlY;
        if (!isRelative) {
          curControlX += x;
          curControlY += y;
        }
        segments[idx] = [
          isRelative ? "c" : "C",
          curControlX,
          curControlY,
          s[1],
          s[2],
          s[3],
          s[4]
        ];
      }
    });
    return this;
  };
  module.exports = SvgPath;
});

// src/input/root.ts
var DEFAULT_ROOT = "[data-markswift-root], [data-h2s-root], body:not(:has([data-markswift-root], [data-h2s-root]))";

// src/compiler/naming.ts
function validateName(name) {
  const reserved = new Set("Self Any Type Protocol View Text Color Image Font Path Shape CGRect CGSize CGPoint CGFloat URL Data String Int Double Float Bool UUID Bundle State Binding Button Toggle Slider TextField SecureField TextEditor Picker ProgressView ScrollView VStack HStack ZStack Grid GridRow Spacer Divider Rectangle RoundedRectangle Ellipse Circle Capsule AngularGradient LinearGradient RadialGradient GeometryReader AnyView Edge UnitPoint Alignment HorizontalAlignment VerticalAlignment ContentMode BlendMode DesignSupport DesignTokens".split(" "));
  for (const type of "UIImage UIFont UIFontDescriptor UIColor UITraitCollection CGAffineTransform CGVector CGPath CGColor StrokeStyle AsyncImage Array Set ClosedRange Axis EdgeInsets EmptyView ForEach ColorPicker DatePicker DisclosureGroup Gauge Link Stepper UnevenRoundedRectangle UTType SwiftUI UIKit Foundation CoreText UniformTypeIdentifiers ViewBuilder ShapeStyle InsettableShape ProgressViewStyle GaugeStyle ToggleStyle ButtonStyle Date Optional Never Void Error".split(" "))
    reserved.add(type);
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(name) || name.startsWith("Markswift") || reserved.has(name)) {
    throw new Error("name must be a Swift type identifier starting with an uppercase ASCII letter (e.g. ProfileCard)");
  }
}

// src/api/convert.ts
import { mkdir as mkdir2, mkdtemp, readFile as readFile3, rm as rm2, writeFile as writeFile2 } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as join3 } from "node:path";

// src/browser/settle.ts
async function settle(page, hide) {
  await page.evaluate(async (hide) => {
    await document.fonts.ready;
    for (const sel of hide) {
      for (const el of document.querySelectorAll(sel))
        el.style.display = "none";
    }
    for (const el of document.querySelectorAll("*")) {
      const cv = getComputedStyle(el).contentVisibility;
      if (cv === "auto")
        el.style.setProperty("content-visibility", "visible", "important");
      else if (cv === "hidden")
        for (const c of el.children)
          c.style.setProperty("display", "none", "important");
    }
    for (const a of document.getAnimations()) {
      try {
        a.finish();
      } catch {
        a.cancel();
      }
    }
    const frame = Promise.withResolvers();
    requestAnimationFrame(() => requestAnimationFrame(() => frame.resolve()));
    await frame.promise;
  }, hide);
}

// src/browser/fonts.ts
import { createHash } from "node:crypto";
async function collectFontFaces(page) {
  return await page.evaluate(() => {
    const KEYWORD_WEIGHT = { normal: 400, bold: 700, lighter: 100, bolder: 700 };
    const weightRange = (s) => {
      const parts = s.trim().split(/\s+/).filter(Boolean);
      const nums = parts.map((p) => KEYWORD_WEIGHT[p.toLowerCase()] ?? Number.parseFloat(p)).filter((n) => Number.isFinite(n));
      if (!nums.length)
        return [400, 400];
      return [Math.min(...nums), Math.max(...nums)];
    };
    const splitSrc = (s) => {
      const out = [];
      let depth = 0, quote = "", start = 0;
      for (let i = 0;i < s.length; i++) {
        const c = s[i];
        if (quote) {
          if (c === quote && s[i - 1] !== "\\")
            quote = "";
        } else if (c === '"' || c === "'")
          quote = c;
        else if (c === "(")
          depth++;
        else if (c === ")")
          depth--;
        else if (c === "," && depth === 0) {
          out.push(s.slice(start, i));
          start = i + 1;
        }
      }
      out.push(s.slice(start));
      return out.map((p) => p.trim()).filter(Boolean);
    };
    const unquote = (s) => s.trim().replace(/^["']|["']$/g, "").trim();
    const faces = [];
    const visit = (rules, base) => {
      for (const rule of rules) {
        if (rule instanceof CSSFontFaceRule) {
          const st = rule.style;
          const family = unquote(st.getPropertyValue("font-family"));
          if (!family)
            continue;
          const src = [];
          for (const entry of splitSrc(st.getPropertyValue("src"))) {
            const url = /url\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^)]*)\s*\)/.exec(entry);
            if (!url)
              continue;
            const fmt = /format\(\s*("[^"]*"|'[^']*'|[^)]*)\s*\)/.exec(entry);
            try {
              src.push({ url: new URL(unquote(url[1]), base).href, ...fmt ? { format: unquote(fmt[1]) } : {} });
            } catch {}
          }
          const styleDesc = unquote(st.getPropertyValue("font-style")).split(/\s+/)[0]?.toLowerCase();
          faces.push({
            family,
            weight: weightRange(st.getPropertyValue("font-weight") || "normal"),
            style: styleDesc === "italic" || styleDesc === "oblique" ? styleDesc : "normal",
            ...st.getPropertyValue("unicode-range") ? { unicodeRange: st.getPropertyValue("unicode-range") } : {},
            src,
            loaded: false
          });
        } else if ("cssRules" in rule)
          visit(rule.cssRules, base);
      }
    };
    for (const sheet of document.styleSheets) {
      if (sheet.ownerNode?.hasAttribute?.("data-h2s-harness"))
        continue;
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      visit(rules, sheet.href ?? document.baseURI);
    }
    const loaded = new Set;
    document.fonts.forEach((f) => {
      if (f.status === "loaded")
        loaded.add(`${unquote(f.family).toLowerCase()}|${f.style}|${f.weight}`);
    });
    const seen = new Set;
    const out = [];
    for (const f of faces) {
      if (!f.src.length)
        continue;
      const key = `${f.family.toLowerCase()}|${f.style}|${f.weight.join(" ")}|${f.unicodeRange ?? ""}|${f.src.map((s) => s.url).join(",")}`;
      if (seen.has(key))
        continue;
      seen.add(key);
      const w = f.weight[0] === f.weight[1] ? String(f.weight[0]) : `${f.weight[0]} ${f.weight[1]}`;
      out.push({ ...f, loaded: loaded.has(`${f.family.toLowerCase()}|${f.style}|${w}`) });
    }
    return out;
  });
}
async function readFontBytes(faces, allowRemote = true) {
  const files = [];
  const byHash = {};
  for (const face of faces) {
    for (const src of face.src) {
      if (src.url.startsWith("data:"))
        continue;
      if (!allowRemote)
        continue;
      let bytes;
      try {
        const res = await fetch(src.url);
        if (!res.ok)
          continue;
        bytes = new Uint8Array(await res.arrayBuffer());
      } catch {
        continue;
      }
      const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
      if (!byHash[hash]) {
        const sig = new TextDecoder("latin1").decode(bytes.subarray(0, 4));
        const ext = sig === "wOF2" ? "woff2" : sig === "wOFF" ? "woff" : sig === "OTTO" ? "otf" : "ttf";
        byHash[hash] = `${hash}.${ext}`;
        files.push({ name: byHash[hash], bytes });
      }
      src.file = `_fonts/${byHash[hash]}`;
      if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/)/.test(src.url))
        src.url = new URL(src.url).pathname;
    }
  }
  return files;
}

// src/browser/capture.ts
import { chromium } from "playwright-core";

// node_modules/zod/v4/core/util.js
function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter((v) => typeof v === "number");
  const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
  return values;
}
function joinValues(array, separator = "|") {
  return array.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}
function cached(getter) {
  const set = false;
  return {
    get value() {
      if (!set) {
        const value = getter();
        Object.defineProperty(this, "value", { value });
        return value;
      }
      throw new Error("cached value already set");
    }
  };
}
function nullish(input) {
  return input === null || input === undefined;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
  const ratio = val / step;
  const roundedRatio = Math.round(ratio);
  const tolerance = 4 * Number.EPSILON * Math.max(Math.abs(ratio), 1);
  if (Math.abs(ratio - roundedRatio) < tolerance)
    return 0;
  return ratio - roundedRatio;
}
var EVALUATING = /* @__PURE__ */ Symbol("evaluating");
function defineLazy(object, key, getter) {
  let value = undefined;
  Object.defineProperty(object, key, {
    get() {
      if (value === EVALUATING) {
        return;
      }
      if (value === undefined) {
        value = EVALUATING;
        value = getter();
      }
      return value;
    },
    set(v) {
      Object.defineProperty(object, key, {
        value: v
      });
    },
    configurable: true
  });
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
function mergeDefs(...defs) {
  const mergedDescriptors = {};
  for (const def of defs) {
    const descriptors = Object.getOwnPropertyDescriptors(def);
    Object.assign(mergedDescriptors, descriptors);
  }
  return Object.defineProperties({}, mergedDescriptors);
}
function esc(str) {
  return JSON.stringify(str);
}
function slugify(input) {
  return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
function isObject(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
var allowsEval = /* @__PURE__ */ cached(() => {
  if (globalConfig.jitless) {
    return false;
  }
  if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
    return false;
  }
  try {
    const F = Function;
    new F("");
    return true;
  } catch (_) {
    return false;
  }
});
function isPlainObject(o) {
  if (isObject(o) === false)
    return false;
  const ctor = o.constructor;
  if (ctor === undefined)
    return true;
  if (typeof ctor !== "function")
    return true;
  const prot = ctor.prototype;
  if (isObject(prot) === false)
    return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
function shallowClone(o) {
  if (isPlainObject(o))
    return { ...o };
  if (Array.isArray(o))
    return [...o];
  if (o instanceof Map)
    return new Map(o);
  if (o instanceof Set)
    return new Set(o);
  return o;
}
var propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== undefined) {
    if (params?.error !== undefined)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function stringifyPrimitive(value) {
  if (typeof value === "bigint")
    return value.toString() + "n";
  if (typeof value === "string")
    return `"${value}"`;
  return `${value}`;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return shape[k]._zod.optin !== undefined && shape[k]._zod.optout === "optional";
  });
}
var NUMBER_FORMAT_RANGES = /* @__PURE__ */ (() => ({
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-340282346638528860000000000000000000000, 340282346638528860000000000000000000000],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
}))();
function pick(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".pick() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = {};
      for (const key of Reflect.ownKeys(mask)) {
        if (!Object.prototype.hasOwnProperty.call(currDef.shape, key)) {
          throw new Error(`Unrecognized key: "${String(key)}"`);
        }
        if (!mask[key])
          continue;
        assignProp(newShape, key, currDef.shape[key]);
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function omit(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".omit() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = { ...schema._zod.def.shape };
      for (const key of Reflect.ownKeys(mask)) {
        if (!Object.prototype.hasOwnProperty.call(currDef.shape, key)) {
          throw new Error(`Unrecognized key: "${String(key)}"`);
        }
        if (!mask[key])
          continue;
        delete newShape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function extend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to extend: expected a plain object");
  }
  const checks = schema._zod.def.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    const existingShape = schema._zod.def.shape;
    for (const key of Reflect.ownKeys(shape)) {
      if (Object.getOwnPropertyDescriptor(existingShape, key) !== undefined) {
        throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
      }
    }
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    }
  });
  return clone(schema, def);
}
function safeExtend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to safeExtend: expected a plain object");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    }
  });
  return clone(schema, def);
}
function merge(a, b) {
  if (!b?._zod?.def) {
    throw new Error("Invalid input to merge: expected an object schema. To merge a plain shape, use `.extend()`.");
  }
  if (a._zod.def.checks?.length) {
    throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
  }
  const def = mergeDefs(a._zod.def, {
    get shape() {
      const _shape = { ...a._zod.def.shape, ...b._zod.def.shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
    get catchall() {
      return b._zod.def.catchall;
    },
    checks: b._zod.def.checks ?? []
  });
  return clone(a, def);
}
function partial(Class, schema, mask, name = "partial") {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(`.${name}() cannot be used on object schemas containing refinements`);
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key of Reflect.ownKeys(mask)) {
          if (!Object.prototype.hasOwnProperty.call(oldShape, key)) {
            throw new Error(`Unrecognized key: "${String(key)}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = Class ? new Class({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      } else {
        for (const key of Reflect.ownKeys(oldShape)) {
          shape[key] = Class ? new Class({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    },
    checks: []
  });
  return clone(schema, def);
}
function required(Class, schema, mask) {
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key of Reflect.ownKeys(mask)) {
          if (!Object.prototype.hasOwnProperty.call(shape, key)) {
            throw new Error(`Unrecognized key: "${String(key)}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = new Class({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      } else {
        for (const key of Reflect.ownKeys(oldShape)) {
          shape[key] = new Class({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    }
  });
  return clone(schema, def);
}
function aborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex;i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function explicitlyAborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex;i < x.issues.length; i++) {
    if (x.issues[i]?.continue === false) {
      return true;
    }
  }
  return false;
}
function prefixIssues(path, issues) {
  return issues.map((iss) => {
    var _a;
    (_a = iss).path ?? (_a.path = []);
    iss.path.unshift(path);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function attachSchema(issues, start, inst) {
  var _a;
  for (let i = start;i < issues.length; i++) {
    (_a = issues[i]).schema ?? (_a.schema = inst);
  }
}
function finalizeIssue(iss, ctx, config) {
  var _a;
  const traits = iss.inst?._zod?.traits;
  if (traits?.has("$ZodType")) {
    if (traits.has("$ZodCheck"))
      (_a = iss).schema ?? (_a.schema = iss.inst);
    else
      iss.schema = iss.inst;
  }
  const schemaError = iss.schema !== iss.inst ? iss.schema?._zod.def?.error : undefined;
  const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(schemaError?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
  const { inst: _inst, schema: _schema, continue: _continue, input: _input, ...rest } = iss;
  rest.path ?? (rest.path = []);
  rest.message = message;
  if (ctx?.reportInput) {
    rest.input = _input;
  }
  return rest;
}
var highSurrogate = /[\uD800-\uDBFF]/;
function codePointLength(str) {
  const units = str.length;
  if (!highSurrogate.test(str))
    return units;
  let count = units;
  for (let i = 0;i < units - 1; i++) {
    if ((str.charCodeAt(i) & 64512) === 55296 && (str.charCodeAt(i + 1) & 64512) === 56320) {
      count--;
      i++;
    }
  }
  return count;
}
function getLengthableOrigin(input) {
  if (Array.isArray(input))
    return "array";
  if (typeof input === "string")
    return "string";
  return "unknown";
}
function parsedType(data) {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "nan" : "number";
    }
    case "object": {
      if (data === null) {
        return "null";
      }
      if (Array.isArray(data)) {
        return "array";
      }
      const obj = data;
      if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) {
        return obj.constructor.name;
      }
    }
  }
  return t;
}
function issue(...args) {
  const [iss, input, inst] = args;
  if (typeof iss === "string") {
    return {
      message: iss,
      code: "custom",
      input,
      inst
    };
  }
  return { ...iss };
}
function members(proto, table) {
  for (const key in table) {
    const desc = Object.getOwnPropertyDescriptor(table, key);
    if (desc.get)
      Object.defineProperty(proto, key, { ...desc, enumerable: false });
    else
      defineBound(proto, key, desc.value);
  }
}
function own(inst, key, value, enumerable = true) {
  Object.defineProperty(inst, key, { configurable: true, writable: true, enumerable, value });
  return value;
}
function hide(inst, key, value) {
  return own(inst, key, value, false);
}
function defineBound(proto, key, fn) {
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      return this == null ? fn : own(this, key, fn.bind(this));
    },
    set(value) {
      own(this, key, value);
    }
  });
}
function claim(inst, sentinel) {
  const proto = Object.getPrototypeOf(inst);
  return sentinel in proto ? undefined : proto;
}
var installing;
var broke = false;
var breaker = {
  configurable: true,
  get() {
    broke = true;
    return;
  }
};
function defineLazyInternal(inst, key, compute) {
  const proto = Object.getPrototypeOf(inst._zod);
  if (key in proto && installing !== inst._zod) {
    installing = undefined;
    return;
  }
  installing = inst._zod;
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      Object.defineProperty(this, key, breaker);
      const outer = broke;
      broke = false;
      try {
        const value = compute(this);
        if (broke)
          delete this[key];
        else
          Object.defineProperty(this, key, { configurable: true, writable: true, value });
        broke = broke || outer;
        return value;
      } catch (err) {
        delete this[key];
        broke = broke || outer;
        throw err;
      }
    },
    set(value) {
      Object.defineProperty(this, key, { configurable: true, writable: true, value });
    }
  });
}
function installLazyProp(inst, key, make, enumerable) {
  const proto = claim(inst, key);
  if (!proto)
    return;
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      const desc = { configurable: true, writable: true, enumerable, value: undefined };
      Object.defineProperty(this, key, desc);
      desc.value = make(this);
      Object.defineProperty(this, key, desc);
      return desc.value;
    },
    set(value) {
      Object.defineProperty(this, key, { configurable: true, writable: true, enumerable, value });
    }
  });
}
var CONSTANT_CATCH = "~constantCatch";
function constantCatch(value) {
  const fn = () => value;
  fn[CONSTANT_CATCH] = true;
  return fn;
}

// node_modules/zod/v4/core/core.js
var _a;
var _zodDesc = { value: undefined, enumerable: false };
var _E = "captureStackTrace" in Error ? Error : null;
function newError(Definition) {
  const E = _E;
  if (E) {
    const saved = E.stackTraceLimit;
    if (typeof saved === "number") {
      try {
        E.stackTraceLimit = 0;
      } catch {
        _E = null;
        return new Definition;
      }
      try {
        return new Definition;
      } finally {
        E.stackTraceLimit = saved;
      }
    }
  }
  return new Definition;
}
function $constructor(name, initializer, proto, params) {
  const zodProto = {};
  function Internals(def) {
    this.def = def;
    this.constr = _;
    this.traits = new Set;
  }
  Internals.prototype = zodProto;
  const protoMembers = proto;
  const initialized = protoMembers && new WeakSet;
  function init(inst, def) {
    if (!inst._zod) {
      _zodDesc.value = new Internals(def);
      try {
        Object.defineProperty(inst, "_zod", _zodDesc);
      } finally {
        _zodDesc.value = undefined;
      }
    }
    if (inst._zod.traits.has(name)) {
      return;
    }
    inst._zod.traits.add(name);
    initializer(inst, def);
    if (initialized) {
      const own = Object.getPrototypeOf(inst);
      const ctorProto = inst._zod.constr.prototype;
      let up = own;
      while (up && up !== ctorProto)
        up = Object.getPrototypeOf(up);
      const target = up ?? own;
      if (!initialized.has(target)) {
        initialized.add(target);
        members(target, protoMembers);
      }
    }
    const proto = _.prototype;
    for (const k in proto) {
      if (!Object.prototype.hasOwnProperty.call(proto, k))
        continue;
      if (!(k in inst)) {
        inst[k] = proto[k].bind(inst);
      }
    }
  }
  const Parent = params?.Parent ?? Object;

  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name });
  function _(def) {
    const inst = params?.Parent ? newError(Definition) : this;
    init(inst, def);
    const deferred = inst._zod.deferred;
    if (deferred) {
      for (const fn of deferred) {
        fn();
      }
      inst._zod.deferred = undefined;
    }
    const pp = globalThis.__zod_globalConfig?.postProcessor;
    if (pp)
      pp(inst);
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name);
    }
  });
  Object.defineProperty(_, "name", { value: name });
  return _;
}
class $ZodAsyncError extends Error {
  constructor() {
    super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
  }
}

class $ZodEncodeError extends Error {
  constructor(name) {
    super(`Encountered unidirectional transform during encode: ${name}`);
    this.name = "ZodEncodeError";
  }
}
(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
  if (newConfig)
    Object.assign(globalConfig, newConfig);
  return globalConfig;
}
// node_modules/zod/v4/core/errors.js
function _getMessage() {
  const internals = this._zod;
  internals.message ?? (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
  return internals.message;
}
function _setMessage(value) {
  this._zod.message = value;
}
var _messageDesc = {
  get: _getMessage,
  set: _setMessage,
  enumerable: true,
  configurable: true
};
var _zodDesc2 = { value: undefined, enumerable: false };
var _issuesDesc = { value: undefined, enumerable: false };
var _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
var initializer = (inst, def) => {
  inst.name = "$ZodError";
  _zodDesc2.value = inst._zod;
  Object.defineProperty(inst, "_zod", _zodDesc2);
  _issuesDesc.value = def;
  Object.defineProperty(inst, "issues", _issuesDesc);
  _zodDesc2.value = undefined;
  _issuesDesc.value = undefined;
  Object.defineProperty(inst, "message", _messageDesc);
  const proto = Object.getPrototypeOf(inst);
  if (!_installedToString.has(proto)) {
    _installedToString.add(proto);
    Object.defineProperty(proto, "toString", {
      configurable: true,
      enumerable: false,
      get() {
        const value = () => this.message;
        Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
        return value;
      },
      set(value) {
        Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
      }
    });
  }
};
var $ZodError = $constructor("$ZodError", initializer);
var $ZodRealError = $constructor("$ZodError", initializer, undefined, {
  Parent: Error
});
function node(obj, key, make) {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    if (key === "__proto__") {
      Object.defineProperty(obj, key, { value: make(), writable: true, enumerable: true, configurable: true });
    } else {
      obj[key] = make();
    }
  }
  return obj[key];
}
function flattenError(error, mapper = (issue) => issue.message) {
  const fieldErrors = {};
  const formErrors = [];
  for (const sub of error.issues) {
    if (sub.path.length > 0) {
      node(fieldErrors, sub.path[0], () => []).push(mapper(sub));
    } else {
      formErrors.push(mapper(sub));
    }
  }
  return { formErrors, fieldErrors };
}
function formatError(error, mapper = (issue) => issue.message) {
  const fieldErrors = { _errors: [] };
  const processError = (error, path = []) => {
    for (const issue of error.issues) {
      if (issue.code === "invalid_union" && issue.errors.length) {
        issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
      } else if (issue.code === "invalid_key") {
        processError({ issues: issue.issues }, [...path, ...issue.path]);
      } else if (issue.code === "invalid_element") {
        processError({ issues: issue.issues }, [...path, ...issue.path]);
      } else {
        const fullpath = [...path, ...issue.path];
        if (fullpath.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < fullpath.length) {
            const el = fullpath[i];
            const terminal = i === fullpath.length - 1;
            if (el === "_errors") {
              if (terminal)
                curr._errors.push(mapper(issue));
              i++;
              continue;
            }
            if (!Object.prototype.hasOwnProperty.call(curr, el)) {
              Object.defineProperty(curr, el, {
                value: { _errors: [] },
                enumerable: true,
                writable: true,
                configurable: true
              });
            }
            const node = curr[el];
            if (terminal) {
              node._errors.push(mapper(issue));
            }
            curr = node;
            i++;
          }
        }
      }
    }
  };
  processError(error);
  return fieldErrors;
}

// node_modules/zod/v4/core/parse.js
function finalizeParams(callee, params) {
  return { callee: params?.callee ?? callee, Err: params?.Err };
}
var _parse = (_Err) => {
  const fn = (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
      throw new $ZodAsyncError;
    }
    if (result.issues.length) {
      const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
      captureStackTrace(e, _params?.callee ?? fn);
      throw e;
    }
    return result.value;
  };
  return fn;
};
var _parseAsync = (_Err) => {
  const fn = async (schema, value, _ctx, params) => {
    const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
      result = await result;
    if (result.issues.length) {
      const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
      captureStackTrace(e, params?.callee ?? fn);
      throw e;
    }
    return result.value;
  };
  return fn;
};
var _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError;
  }
  return result.issues.length ? {
    success: false,
    error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
var safeParse = /* @__PURE__ */ _safeParse($ZodRealError);
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length ? {
    success: false,
    error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
var safeParseAsync = /* @__PURE__ */ _safeParseAsync($ZodRealError);
var _encode = (_Err) => {
  const parse = _parse(_Err);
  const fn = (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return parse(schema, value, ctx, finalizeParams(fn, _params));
  };
  return fn;
};
var _decode = (_Err) => {
  const parse = _parse(_Err);
  const fn = (schema, value, _ctx, _params) => {
    return parse(schema, value, _ctx, finalizeParams(fn, _params));
  };
  return fn;
};
var _encodeAsync = (_Err) => {
  const parseAsync = _parseAsync(_Err);
  const fn = async (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return await parseAsync(schema, value, ctx, finalizeParams(fn, _params));
  };
  return fn;
};
var _decodeAsync = (_Err) => {
  const parseAsync = _parseAsync(_Err);
  const fn = async (schema, value, _ctx, _params) => {
    return await parseAsync(schema, value, _ctx, finalizeParams(fn, _params));
  };
  return fn;
};
var _safeEncode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParse(_Err)(schema, value, ctx);
};
var _safeDecode = (_Err) => (schema, value, _ctx) => {
  return _safeParse(_Err)(schema, value, _ctx);
};
var _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParseAsync(_Err)(schema, value, ctx);
};
var _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _safeParseAsync(_Err)(schema, value, _ctx);
};
// node_modules/zod/v4/core/regexes.js
var cuid = /^[cC][0-9a-z]{6,}$/;
var cuid2 = /^[0-9a-z]+$/;
var ulid = /^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/;
var xid = /^[0-9a-vA-V]{20}$/;
var ksuid = /^[A-Za-z0-9]{27}$/;
var nanoid = /^[a-zA-Z0-9_-]{21}$/;
function nanoidOfLength(length) {
  return new RegExp(`^[a-zA-Z0-9_-]{${length}}$`);
}
var duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
var guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
var uuid = (version) => {
  if (!version)
    return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
  return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
var email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
var _emoji = `^[\\p{Extended_Pictographic}\\p{Emoji_Component}]+$`;
function emoji() {
  return new RegExp(_emoji, "u");
}
var ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
var cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
var cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
var base64url = /^[A-Za-z0-9_-]*$/;
var httpProtocol = /^https?$/;
var e164 = /^\+[1-9]\d{6,14}$/;
var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
function anchor(source) {
  return new RegExp(`^${source}$`);
}
var date = /* @__PURE__ */ anchor(dateSource);
function timeSource(args) {
  const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
  const regex = typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : args.seconds ? `${hhmm}:[0-5]\\d(?:\\.\\d+)?` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
  return regex;
}
function time(args) {
  return new RegExp(`^${timeSource(args)}$`);
}
function datetime(args) {
  const opts = ["Z"];
  if (args.offset)
    opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
  const qualified = `${timeSource({ precision: args.precision, seconds: true })}(?:${opts.join("|")})`;
  const timeRegex = args.local ? `${qualified}|${timeSource({ precision: args.precision })}` : qualified;
  return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
var string = (params) => {
  const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
  return new RegExp(`^${regex}$`);
};
var integer = /^-?\d+$/;
var number = /^-?\d+(?:\.\d+)?$/;
var boolean = /^(?:true|false)$/i;
var lowercase = /^[^A-Z]*$/;
var uppercase = /^[^a-z]*$/;

// node_modules/zod/v4/core/checks.js
var $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
  var _a;
  inst._zod ?? (inst._zod = {});
  inst._zod.def = def;
  (_a = inst._zod).onattach ?? (_a.onattach = []);
});
var _whenHasLength = (payload) => {
  const val = payload.value;
  return !nullish(val) && val.length !== undefined;
};
var numericOriginMap = {
  number: "number",
  bigint: "bigint",
  object: "date"
};
var $ZodCheckLessThan = /* @__PURE__ */ $constructor("$ZodCheckLessThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
    if (def.value < curr) {
      if (def.inclusive)
        bag.maximum = def.value;
      else
        bag.exclusiveMaximum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
      return;
    }
    payload.issues.push({
      origin: numericOriginMap[typeof payload.value] ?? origin,
      code: "too_big",
      maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
    if (def.value > curr) {
      if (def.inclusive)
        bag.minimum = def.value;
      else
        bag.exclusiveMinimum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
      return;
    }
    payload.issues.push({
      origin: numericOriginMap[typeof payload.value] ?? origin,
      code: "too_small",
      minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMultipleOf = /* @__PURE__ */ $constructor("$ZodCheckMultipleOf", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst) => {
    var _a;
    (_a = inst._zod.bag).multipleOf ?? (_a.multipleOf = def.value);
  });
  inst._zod.check = (payload) => {
    if (typeof payload.value !== typeof def.value)
      throw new Error("Cannot mix number and bigint in multiple_of check.");
    const isMultiple = typeof payload.value === "bigint" ? def.value !== BigInt(0) && payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0;
    if (isMultiple)
      return;
    payload.issues.push({
      origin: typeof payload.value,
      code: "not_multiple_of",
      divisor: def.value,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  def.format = def.format || "float64";
  const isInt = def.format?.includes("int");
  const origin = isInt ? "int" : "number";
  const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    bag.format = def.format;
    bag.minimum = minimum;
    bag.maximum = maximum;
    if (isInt)
      bag.pattern = integer;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    if (isInt) {
      if (!Number.isInteger(input)) {
        payload.issues.push({
          expected: origin,
          format: def.format,
          code: "invalid_type",
          continue: false,
          input,
          inst
        });
        return;
      }
      if (!Number.isSafeInteger(input)) {
        if (input > 0) {
          payload.issues.push({
            input,
            code: "too_big",
            maximum: Number.MAX_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        } else {
          payload.issues.push({
            input,
            code: "too_small",
            minimum: Number.MIN_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        }
        return;
      }
    }
    if (input < minimum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input > maximum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_big",
        maximum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCheckMaxLength = /* @__PURE__ */ $constructor("$ZodCheckMaxLength", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
  inst._zod.onattach.push((inst) => {
    const curr = inst._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
    if (def.maximum < curr)
      inst._zod.bag.maximum = def.maximum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const units = input.length;
    const length = typeof input === "string" && units > def.maximum ? codePointLength(input) : units;
    if (length <= def.maximum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: def.maximum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMinLength = /* @__PURE__ */ $constructor("$ZodCheckMinLength", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
  inst._zod.onattach.push((inst) => {
    const curr = inst._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
    if (def.minimum > curr)
      inst._zod.bag.minimum = def.minimum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const units = input.length;
    const length = typeof input === "string" && units >= def.minimum && units < def.minimum * 2 ? codePointLength(input) : units;
    if (length >= def.minimum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: def.minimum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLengthEquals = /* @__PURE__ */ $constructor("$ZodCheckLengthEquals", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    bag.minimum = def.length;
    bag.maximum = def.length;
    bag.length = def.length;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const units = input.length;
    const length = typeof input === "string" && units >= def.length && units <= def.length * 2 ? codePointLength(input) : units;
    if (length === def.length)
      return;
    const origin = getLengthableOrigin(input);
    const tooBig = length > def.length;
    payload.issues.push({
      origin,
      ...tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length },
      inclusive: true,
      exact: true,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStringFormat = /* @__PURE__ */ $constructor("$ZodCheckStringFormat", (inst, def) => {
  var _a, _b;
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    bag.format = def.format;
    if (def.pattern) {
      bag.patterns ?? (bag.patterns = new Set);
      bag.patterns.add(def.pattern);
    }
  });
  if (def.pattern)
    (_a = inst._zod).check ?? (_a.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: def.format,
        input: payload.value,
        ...def.pattern ? { pattern: def.pattern.toString() } : {},
        inst,
        continue: !def.abort
      });
    });
  else
    (_b = inst._zod).check ?? (_b.check = () => {});
});
var $ZodCheckRegex = /* @__PURE__ */ $constructor("$ZodCheckRegex", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    def.pattern.lastIndex = 0;
    if (def.pattern.test(payload.value))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "regex",
      input: payload.value,
      pattern: def.pattern.toString(),
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLowerCase = /* @__PURE__ */ $constructor("$ZodCheckLowerCase", (inst, def) => {
  def.pattern ?? (def.pattern = lowercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckUpperCase = /* @__PURE__ */ $constructor("$ZodCheckUpperCase", (inst, def) => {
  def.pattern ?? (def.pattern = uppercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckIncludes = /* @__PURE__ */ $constructor("$ZodCheckIncludes", (inst, def) => {
  $ZodCheck.init(inst, def);
  const escapedRegex = escapeRegex(def.includes);
  const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position},}${escapedRegex}` : escapedRegex);
  def.pattern = pattern;
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    bag.patterns ?? (bag.patterns = new Set);
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.includes(def.includes, def.position))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "includes",
      includes: def.includes,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStartsWith = /* @__PURE__ */ $constructor("$ZodCheckStartsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    bag.patterns ?? (bag.patterns = new Set);
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.startsWith(def.prefix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "starts_with",
      prefix: def.prefix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckEndsWith = /* @__PURE__ */ $constructor("$ZodCheckEndsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    bag.patterns ?? (bag.patterns = new Set);
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.endsWith(def.suffix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "ends_with",
      suffix: def.suffix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckOverwrite = /* @__PURE__ */ $constructor("$ZodCheckOverwrite", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    payload.value = def.tx(payload.value);
  };
});

// node_modules/zod/v4/core/doc.js
class Doc {
  constructor(args = [], closed = {}) {
    this.content = [];
    this.indent = 0;
    this.args = args;
    this.closed = closed;
  }
  indented(fn) {
    this.indent += 1;
    fn(this);
    this.indent -= 1;
  }
  write(arg) {
    if (typeof arg === "function") {
      arg(this, { execution: "sync" });
      arg(this, { execution: "async" });
      return;
    }
    const content = arg;
    const lines = content.split(`
`).filter((x) => x);
    const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
    const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
    for (const line of dedented) {
      this.content.push(line);
    }
  }
  compile() {
    const F = Function;
    const content = this?.content ?? [``];
    const factory = new F(...Object.keys(this.closed), `return function (${this.args.join(", ")}) {
${content.join(`
`)}
};`);
    return factory(...Object.values(this.closed));
  }
}

// node_modules/zod/v4/core/versions.js
var version = {
  major: 4,
  minor: 5,
  patch: 4
};

// node_modules/zod/v4/core/schemas.js
var $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version;
  const defChecks = inst._zod.def.checks;
  const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks ?? []] : defChecks?.length ? [...defChecks] : [];
  for (const ch of checks) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks.length === 0) {
    (_a = inst._zod).deferred ?? (_a.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks, ctx) => {
      if (payload.memo)
        return payload;
      let isAborted = aborted(payload);
      let asyncResult;
      for (const ch of checks) {
        if (ch._zod.def.when) {
          if (explicitlyAborted(payload))
            continue;
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun)
            continue;
        } else if (isAborted) {
          continue;
        }
        const currLen = payload.issues.length;
        const _ = ch._zod.check(payload);
        if (_ instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError;
        }
        if (asyncResult || _ instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _;
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              return;
            attachSchema(payload.issues, currLen, inst);
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen)
            continue;
          attachSchema(payload.issues, currLen, inst);
          if (!isAborted)
            isAborted = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    const handleCanaryResult = (canary, payload, ctx) => {
      if (aborted(canary)) {
        canary.aborted = true;
        return canary;
      }
      const checkResult = runChecks(payload, checks, ctx);
      if (checkResult instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError;
        return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
      }
      return inst._zod.parse(checkResult, ctx);
    };
    inst._zod.run = (payload, ctx) => {
      if (ctx.skipChecks) {
        return inst._zod.parse(payload, ctx);
      }
      if (ctx.direction === "backward") {
        const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
        if (canary instanceof Promise) {
          return canary.then((canary) => {
            return handleCanaryResult(canary, payload, ctx);
          });
        }
        return handleCanaryResult(canary, payload, ctx);
      }
      const result = inst._zod.parse(payload, ctx);
      if (result instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError;
        return result.then((result) => runChecks(result, checks, ctx));
      }
      return runChecks(result, checks, ctx);
    };
  }
}, {
  get "~standard"() {
    return hide(this, "~standard", standardProps(this));
  },
  set "~standard"(value) {
    own(this, "~standard", value);
  }
});
var toStandardResult = (r) => r.success ? { value: r.data } : { issues: r.error?.issues };
function standardProps(inst) {
  return {
    validate: (value) => {
      try {
        return toStandardResult(safeParse(inst, value));
      } catch (_) {
        return safeParseAsync(inst, value).then(toStandardResult);
      }
    },
    vendor: "zod",
    version: 1
  };
}
var $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string(inst._zod.bag);
  inst._zod.parse = (payload, _) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_) {}
    if (typeof payload.value === "string")
      return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodStringFormat = /* @__PURE__ */ $constructor("$ZodStringFormat", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  $ZodString.init(inst, def);
});
var $ZodGUID = /* @__PURE__ */ $constructor("$ZodGUID", (inst, def) => {
  def.pattern ?? (def.pattern = guid);
  $ZodStringFormat.init(inst, def);
});
var $ZodUUID = /* @__PURE__ */ $constructor("$ZodUUID", (inst, def) => {
  if (def.version) {
    const versionMap = {
      v1: 1,
      v2: 2,
      v3: 3,
      v4: 4,
      v5: 5,
      v6: 6,
      v7: 7,
      v8: 8
    };
    const v = versionMap[def.version];
    if (v === undefined)
      throw new Error(`Invalid UUID version: "${def.version}"`);
    def.pattern ?? (def.pattern = uuid(v));
  } else
    def.pattern ?? (def.pattern = uuid());
  $ZodStringFormat.init(inst, def);
});
var $ZodEmail = /* @__PURE__ */ $constructor("$ZodEmail", (inst, def) => {
  def.pattern ?? (def.pattern = email);
  $ZodStringFormat.init(inst, def);
});
var URL_BAD_FORMAT = 1;
var URL_UNPARSEABLE = 2;
function parseURLObject(trimmed, def) {
  if (!def.normalize && def.protocol?.source === httpProtocol.source && !/^https?:\/\//i.test(trimmed)) {
    return URL_BAD_FORMAT;
  }
  try {
    return new URL(trimmed);
  } catch {
    return URL_UNPARSEABLE;
  }
}
var asciiTabOrNewline = /[\t\n\r]/g;
function stripTabAndNewline(value) {
  return value.replace(asciiTabOrNewline, "");
}
function urlHostnameOk(url, hostname) {
  hostname.lastIndex = 0;
  return hostname.test(url.hostname);
}
function urlProtocolOk(url, protocol) {
  protocol.lastIndex = 0;
  return protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol);
}
var $ZodURL = /* @__PURE__ */ $constructor("$ZodURL", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    try {
      const trimmed = payload.value.trim();
      const url = parseURLObject(trimmed, def);
      if (url === URL_BAD_FORMAT) {
        payload.issues.push({
          code: "invalid_format",
          format: "url",
          note: "Invalid URL format",
          input: payload.value,
          inst,
          continue: !def.abort
        });
        return;
      }
      if (url === URL_UNPARSEABLE) {
        payload.issues.push({
          code: "invalid_format",
          format: "url",
          input: payload.value,
          inst,
          continue: !def.abort
        });
        return;
      }
      if (def.hostname && !urlHostnameOk(url, def.hostname)) {
        payload.issues.push({
          code: "invalid_format",
          format: "url",
          note: "Invalid hostname",
          pattern: def.hostname.source,
          input: payload.value,
          inst,
          continue: !def.abort
        });
      }
      if (def.protocol && !urlProtocolOk(url, def.protocol)) {
        payload.issues.push({
          code: "invalid_format",
          format: "url",
          note: "Invalid protocol",
          pattern: def.protocol.source,
          input: payload.value,
          inst,
          continue: !def.abort
        });
      }
      payload.value = def.normalize ? url.href : stripTabAndNewline(trimmed);
      return;
    } catch (_) {
      payload.issues.push({
        code: "invalid_format",
        format: "url",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodEmoji = /* @__PURE__ */ $constructor("$ZodEmoji", (inst, def) => {
  def.pattern ?? (def.pattern = emoji());
  $ZodStringFormat.init(inst, def);
});
var $ZodNanoID = /* @__PURE__ */ $constructor("$ZodNanoID", (inst, def) => {
  if (def.length !== undefined && (!Number.isInteger(def.length) || def.length < 1))
    throw new Error(`Invalid nanoid length: ${def.length}`);
  def.pattern ?? (def.pattern = def.length === undefined ? nanoid : nanoidOfLength(def.length));
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID = /* @__PURE__ */ $constructor("$ZodCUID", (inst, def) => {
  def.pattern ?? (def.pattern = cuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID2 = /* @__PURE__ */ $constructor("$ZodCUID2", (inst, def) => {
  def.pattern ?? (def.pattern = cuid2);
  $ZodStringFormat.init(inst, def);
});
var $ZodULID = /* @__PURE__ */ $constructor("$ZodULID", (inst, def) => {
  def.pattern ?? (def.pattern = ulid);
  $ZodStringFormat.init(inst, def);
});
var $ZodXID = /* @__PURE__ */ $constructor("$ZodXID", (inst, def) => {
  def.pattern ?? (def.pattern = xid);
  $ZodStringFormat.init(inst, def);
});
var $ZodKSUID = /* @__PURE__ */ $constructor("$ZodKSUID", (inst, def) => {
  def.pattern ?? (def.pattern = ksuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodISODateTime = /* @__PURE__ */ $constructor("$ZodISODateTime", (inst, def) => {
  def.pattern ?? (def.pattern = datetime(def));
  $ZodStringFormat.init(inst, def);
  if (def.local || def.precision === -1) {
    inst._zod.bag.laxFormat = true;
    inst._zod.onattach.push((s) => {
      s._zod.bag.laxFormat = true;
    });
  }
});
var $ZodISODate = /* @__PURE__ */ $constructor("$ZodISODate", (inst, def) => {
  def.pattern ?? (def.pattern = date);
  $ZodStringFormat.init(inst, def);
});
var $ZodISOTime = /* @__PURE__ */ $constructor("$ZodISOTime", (inst, def) => {
  def.pattern ?? (def.pattern = time(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODuration = /* @__PURE__ */ $constructor("$ZodISODuration", (inst, def) => {
  def.pattern ?? (def.pattern = duration);
  $ZodStringFormat.init(inst, def);
});
var $ZodIPv4 = /* @__PURE__ */ $constructor("$ZodIPv4", (inst, def) => {
  def.pattern ?? (def.pattern = ipv4);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `ipv4`;
});
var ipv6Alphabet = /^[0-9a-fA-F:.]+$/;
function isValidIPv6(value) {
  if (!ipv6Alphabet.test(value))
    return false;
  try {
    new URL(`http://[${value}]`);
    return true;
  } catch {
    return false;
  }
}
var $ZodIPv6 = /* @__PURE__ */ $constructor("$ZodIPv6", (inst, def) => {
  def.pattern ?? (def.pattern = ipv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `ipv6`;
  inst._zod.check = (payload) => {
    if (!isValidIPv6(payload.value)) {
      payload.issues.push({
        code: "invalid_format",
        format: "ipv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCIDRv4 = /* @__PURE__ */ $constructor("$ZodCIDRv4", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv4);
  $ZodStringFormat.init(inst, def);
});
function isValidCIDRv6(value) {
  const parts = value.split("/");
  if (parts.length !== 2)
    return false;
  const [address, prefix] = parts;
  if (!prefix)
    return false;
  const prefixNum = Number(prefix);
  if (`${prefixNum}` !== prefix)
    return false;
  if (prefixNum < 0 || prefixNum > 128)
    return false;
  return isValidIPv6(address);
}
var $ZodCIDRv6 = /* @__PURE__ */ $constructor("$ZodCIDRv6", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (!isValidCIDRv6(payload.value)) {
      payload.issues.push({
        code: "invalid_format",
        format: "cidrv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
function isValidBase64(data) {
  if (data === "")
    return true;
  if (/\s/.test(data))
    return false;
  if (data.length % 4 !== 0)
    return false;
  try {
    atob(data);
    return true;
  } catch {
    return false;
  }
}
var $ZodBase64 = /* @__PURE__ */ $constructor("$ZodBase64", (inst, def) => {
  def.pattern ?? (def.pattern = base64);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.contentEncoding = "base64";
  inst._zod.check = (payload) => {
    if (isValidBase64(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
function isValidBase64URL(data) {
  if (!base64url.test(data))
    return false;
  const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return isValidBase64(padded);
}
var $ZodBase64URL = /* @__PURE__ */ $constructor("$ZodBase64URL", (inst, def) => {
  def.pattern ?? (def.pattern = base64url);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.contentEncoding = "base64url";
  inst._zod.check = (payload) => {
    if (isValidBase64URL(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64url",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodE164 = /* @__PURE__ */ $constructor("$ZodE164", (inst, def) => {
  def.pattern ?? (def.pattern = e164);
  $ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
  try {
    const tokensParts = token.split(".");
    if (tokensParts.length !== 3)
      return false;
    const [header] = tokensParts;
    if (!header)
      return false;
    const parsedHeader = JSON.parse(atob(header));
    if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
      return false;
    if (!parsedHeader.alg)
      return false;
    if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
      return false;
    return true;
  } catch {
    return false;
  }
}
var $ZodJWT = /* @__PURE__ */ $constructor("$ZodJWT", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (isValidJWT(payload.value, def.alg))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "jwt",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = inst._zod.bag.pattern ?? number;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_) {}
    const input = payload.value;
    if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
      return payload;
    }
    const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? String(input) : undefined : undefined;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input,
      inst,
      ...received ? { received } : {}
    });
    return payload;
  };
});
var $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumberFormat", (inst, def) => {
  $ZodCheckNumberFormat.init(inst, def);
  $ZodNumber.init(inst, def);
});
var $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = boolean;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Boolean(payload.value);
      } catch (_) {}
    const input = payload.value;
    if (typeof input === "boolean")
      return payload;
    payload.issues.push({
      expected: "boolean",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
var $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    payload.issues.push({
      expected: "never",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
var $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
  $ZodType.init(inst, def);
  const memo = globalConfig.memoizer;
  memo?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        expected: "array",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = memo ? memo.alloc(inst, payload, Array(input.length), ctx) : Array(input.length);
    const proms = [];
    for (let i = 0;i < input.length; i++) {
      const item = input[i];
      const result = def.element._zod.run({
        value: item,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result) => handleArrayResult(result, payload, i)));
      } else {
        handleArrayResult(result, payload, i);
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
function handlePropertyResult(result, final, key, input, optin, optout) {
  const isPresent = key in input;
  const isOptionalOut = optout === "optional";
  if (!isPresent && isOptionalOut && optin === "optional") {
    return;
  }
  if (result.issues.length) {
    if (optin !== undefined && isOptionalOut && !isPresent) {
      return;
    }
    final.issues.push(...prefixIssues(key, result.issues));
  }
  if (!isPresent && optin === undefined) {
    if (!result.issues.length) {
      final.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: undefined,
        path: [key]
      });
    }
    return;
  }
  if (result.value === undefined) {
    if (isPresent) {
      final.value[key] = undefined;
    }
  } else {
    final.value[key] = result.value;
  }
}
var NO_SYMBOL_KEYS = [];
function normalizeDef(def) {
  const keys = Object.keys(def.shape);
  const ownSymbols = Object.getOwnPropertySymbols(def.shape);
  const symbolKeys = ownSymbols.length ? ownSymbols : NO_SYMBOL_KEYS;
  const allKeys = symbolKeys.length ? [...keys, ...symbolKeys] : keys;
  for (const k of allKeys) {
    if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
      throw new Error(`Invalid element at key "${String(k)}": expected a Zod schema`);
    }
  }
  const okeys = optionalKeys(def.shape);
  return {
    ...def,
    allKeys,
    symbolKeys,
    keySet: new Set(keys),
    numKeys: keys.length,
    optionalKeys: new Set(okeys)
  };
}
function handleCatchall(proms, input, payload, ctx, def, inst) {
  const unrecognized = [];
  const keySet = def.keySet;
  const _catchall = def.catchall._zod;
  const t = _catchall.def.type;
  const optin = _catchall.optin;
  const optout = _catchall.optout;
  for (const key in input) {
    if (keySet.has(key))
      continue;
    if (key === "__proto__") {
      if (t === "never")
        unrecognized.push(key);
      continue;
    }
    if (t === "never") {
      unrecognized.push(key);
      continue;
    }
    const r = _catchall.run({ value: input[key], issues: [] }, ctx);
    if (r instanceof Promise) {
      proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
    } else {
      handlePropertyResult(r, payload, key, input, optin, optout);
    }
  }
  if (unrecognized.length) {
    payload.issues.push({
      code: "unrecognized_keys",
      keys: unrecognized,
      input,
      inst,
      continue: true
    });
  }
  if (!proms.length)
    return payload;
  return Promise.all(proms).then(() => {
    return payload;
  });
}
var propShapes = new WeakMap;
var $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
  $ZodType.init(inst, def);
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  if (!desc?.get) {
    const sh = def.shape;
    propShapes.set(def, sh);
    Object.defineProperty(def, "shape", {
      get: () => {
        const newSh = { ...sh };
        Object.defineProperty(def, "shape", {
          value: newSh
        });
        propShapes.set(def, newSh);
        return newSh;
      }
    });
  }
  const _normalized = cached(() => normalizeDef(def));
  defineLazyInternal(inst, "propValues", (zod) => {
    const shape = zod.def.shape;
    const propValues = {};
    for (const key in shape) {
      const field = shape[key]._zod;
      if (field.values) {
        if (!Object.prototype.hasOwnProperty.call(propValues, key)) {
          assignProp(propValues, key, new Set);
        }
        for (const v of field.values)
          propValues[key].add(v);
        if (field.optin !== undefined)
          propValues[key].add(undefined);
      }
    }
    return propValues;
  });
  const isObject2 = isObject;
  const catchall = def.catchall;
  let value;
  const memo = globalConfig.memoizer;
  memo?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
    const proms = [];
    const shape = value.shape;
    for (const key of value.allKeys) {
      if (key === "__proto__")
        continue;
      const el = shape[key];
      const optin = el._zod.optin;
      const optout = el._zod.optout;
      const r = el._zod.run({ value: input[key], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
      } else {
        handlePropertyResult(r, payload, key, input, optin, optout);
      }
    }
    if (!catchall) {
      return proms.length ? Promise.all(proms).then(() => payload) : payload;
    }
    return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
  };
});
var $ZodObjectJIT = /* @__PURE__ */ $constructor("$ZodObjectJIT", (inst, def) => {
  $ZodObject.init(inst, def);
  const superParse = inst._zod.parse;
  const _normalized = cached(() => normalizeDef(def));
  const memo = globalConfig.memoizer;
  const generateFastpass = (shape) => {
    const normalized = _normalized.value;
    const syms = normalized.symbolKeys;
    const doc = new Doc(["payload", "ctx"], { shape, inst, memo, syms });
    const parseStr = (k) => `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
    const prefixStr = (id, k) => `
          for (let i = 0; i < ${id}.issues.length; i++) {
            const iss = ${id}.issues[i];
            iss.path = iss.path ? [${k}, ...iss.path] : [${k}];
            payload.issues.push(iss);
          }`;
    doc.write(`const input = payload.value;`);
    const ids = Object.create(null);
    let counter = 0;
    for (const key of normalized.allKeys) {
      ids[key] = `key_${counter++}`;
    }
    doc.write(memo ? `const newResult = memo.alloc(inst, payload, {}, ctx);` : `const newResult = {};`);
    for (const key of normalized.allKeys) {
      if (key === "__proto__")
        continue;
      const id = ids[key];
      const k = typeof key === "symbol" ? `syms[${syms.indexOf(key)}]` : esc(key);
      const isPresent = `${k} in input`;
      const schema = shape[key];
      const optin = schema?._zod?.optin;
      const isOptionalIn = optin !== undefined;
      const isOptionalOut = schema?._zod?.optout === "optional";
      doc.write(`const ${id} = ${parseStr(k)};`);
      if (isOptionalIn && isOptionalOut) {
        const assign = optin === "optional" ? `${id}_present` : `${id}.value !== undefined || ${id}_present`;
        doc.write(`
        const ${id}_present = ${isPresent};
        if (!${id}.issues.length || ${id}_present) {
          if (${id}.issues.length) {${prefixStr(id, k)}
          }

          if (${assign}) {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
      } else if (!isOptionalIn) {
        doc.write(`
        const ${id}_present = ${isPresent};
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
        }

        if (${id}_present) {
          newResult[${k}] = ${id}.value;
        }

      `);
      } else {
        doc.write(`
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
        
        if (${id}.value === undefined) {
          if (${isPresent}) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }

      `);
      }
    }
    doc.write(`payload.value = newResult;`);
    doc.write(`return payload;`);
    return doc.compile();
  };
  let fastpass;
  const isObject2 = isObject;
  const jit = !globalConfig.jitless;
  const allowsEval2 = allowsEval;
  const fastEnabled = jit && allowsEval2.value;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
      if (!fastpass)
        fastpass = generateFastpass(def.shape);
      payload = fastpass(payload, ctx);
      if (!catchall)
        return payload;
      return handleCatchall([], input, payload, ctx, value, inst);
    }
    return superParse(payload, ctx);
  };
});
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  const nonaborted = results.filter((r) => !aborted(r));
  if (nonaborted.length === 1) {
    final.value = nonaborted[0].value;
    return nonaborted[0];
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  });
  return final;
}
var $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.options.some((o) => o._zod.optin === "defaulted") ? "defaulted" : zod.def.options.some((o) => o._zod.optin !== undefined) ? "optional" : undefined);
  defineLazyInternal(inst, "optout", (zod) => zod.def.options.some((o) => o._zod.optout === "optional") ? "optional" : undefined);
  defineLazyInternal(inst, "values", (zod) => {
    if (zod.def.options.every((o) => o._zod.values)) {
      return new Set(zod.def.options.flatMap((option) => Array.from(option._zod.values)));
    }
    return;
  });
  defineLazyInternal(inst, "pattern", (zod) => {
    if (zod.def.options.every((o) => o._zod.pattern)) {
      const patterns = zod.def.options.map((o) => o._zod.pattern);
      return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
    }
    return;
  });
  const first = def.options.length === 1 ? def.options[0]._zod.run : null;
  inst._zod.parse = (payload, ctx) => {
    if (first) {
      return first(payload, ctx);
    }
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run({
        value: payload.value,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        if (result.issues.length === 0)
          return result;
        results.push(result);
      }
    }
    if (!async)
      return handleUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results) => {
      return handleUnionResults(results, payload, inst, ctx);
    });
  };
});
var $ZodIntersection = /* @__PURE__ */ $constructor("$ZodIntersection", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    const left = def.left._zod.run({ value: input, issues: [] }, ctx);
    const right = def.right._zod.run({ value: input, issues: [] }, ctx);
    const async = left instanceof Promise || right instanceof Promise;
    if (async) {
      return Promise.all([left, right]).then(([left, right]) => {
        return handleIntersectionResults(payload, left, right);
      });
    }
    return handleIntersectionResults(payload, left, right);
  };
});
function mergeValues(a, b) {
  if (a === b) {
    return { valid: true, data: a };
  }
  if (a instanceof Date && b instanceof Date && +a === +b) {
    return { valid: true, data: a };
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const bKeys = Object.keys(b);
    const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    if (Object.prototype.hasOwnProperty.call(newObj, "__proto__"))
      delete newObj.__proto__;
    for (const key of sharedKeys) {
      if (key === "__proto__")
        continue;
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
        };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return { valid: false, mergeErrorPath: [] };
    }
    const newArray = [];
    for (let index = 0;index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
        };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  }
  return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
  const unrecKeys = new Map;
  let unrecIssue;
  const keyIssues = new Map;
  const collect = (iss, side) => {
    let keys;
    if (iss.code === "unrecognized_keys" && !iss.path?.length) {
      unrecIssue ?? (unrecIssue = iss);
      keys = iss.keys;
    } else if (iss.code === "invalid_key" && iss.origin === "record" && iss.path?.length === 1) {
      const k = String(iss.path[0]);
      if (!keyIssues.has(k))
        keyIssues.set(k, iss);
      keys = [k];
    } else {
      return false;
    }
    for (const k of keys) {
      if (!unrecKeys.has(k))
        unrecKeys.set(k, {});
      unrecKeys.get(k)[side] = true;
    }
    return true;
  };
  for (const iss of left.issues) {
    if (!collect(iss, "l"))
      result.issues.push(iss);
  }
  for (const iss of right.issues) {
    if (!collect(iss, "r"))
      result.issues.push(iss);
  }
  const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
  if (bothKeys.length) {
    const aggregated = unrecIssue ? bothKeys.filter((k) => unrecIssue.keys.includes(k)) : [];
    if (aggregated.length)
      result.issues.push({ ...unrecIssue, keys: aggregated });
    for (const k of bothKeys) {
      if (!aggregated.includes(k) && keyIssues.has(k))
        result.issues.push(keyIssues.get(k));
    }
  }
  const merged = mergeValues(left.value, right.value);
  if (!merged.valid) {
    if (aborted(result))
      return result;
    throw new Error(`Unmergable intersection. Error path: ` + `${JSON.stringify(merged.mergeErrorPath)}`);
  }
  result.value = merged.data;
  return result;
}
var $ZodTuple = /* @__PURE__ */ $constructor("$ZodTuple", (inst, def) => {
  $ZodType.init(inst, def);
  const items = def.items;
  const memo = globalConfig.memoizer;
  memo?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        input,
        inst,
        expected: "tuple",
        code: "invalid_type"
      });
      return payload;
    }
    payload.value = memo ? memo.alloc(inst, payload, [], ctx) : [];
    const proms = [];
    const optinStart = getTupleOptStart(items, "optin");
    const optoutStart = getTupleOptStart(items, "optout");
    if (!def.rest) {
      if (input.length < optinStart) {
        payload.issues.push({
          code: "too_small",
          minimum: optinStart,
          inclusive: true,
          input,
          inst,
          origin: "array"
        });
        return payload;
      }
      if (input.length > items.length) {
        payload.issues.push({
          code: "too_big",
          maximum: items.length,
          inclusive: true,
          input,
          inst,
          origin: "array"
        });
      }
    }
    const itemResults = new Array(items.length);
    for (let i = 0;i < items.length; i++) {
      const r = items[i]._zod.run({ value: input[i], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((rr) => {
          itemResults[i] = rr;
        }));
      } else {
        itemResults[i] = r;
      }
    }
    if (def.rest) {
      let i = items.length - 1;
      const rest = input.slice(items.length);
      for (const el of rest) {
        i++;
        const result = def.rest._zod.run({ value: el, issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((r) => handleTupleResult(r, payload, i)));
        } else {
          handleTupleResult(result, payload, i);
        }
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => handleTupleResults(itemResults, payload, items, input, optoutStart));
    }
    return handleTupleResults(itemResults, payload, items, input, optoutStart);
  };
});
function getTupleOptStart(items, key) {
  for (let i = items.length - 1;i >= 0; i--) {
    const omittable = key === "optin" ? items[i]._zod.optin !== undefined : items[i]._zod.optout === "optional";
    if (!omittable)
      return i + 1;
  }
  return 0;
}
function handleTupleResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
function handleTupleResults(itemResults, final, items, input, optoutStart) {
  for (let i = 0;i < items.length; i++) {
    const r = itemResults[i];
    const isPresent = i < input.length;
    if (!isPresent && i >= optoutStart && items[i]._zod.optin === "optional") {
      final.value.length = i;
      break;
    }
    if (r.issues.length) {
      if (!isPresent && i >= optoutStart) {
        final.value.length = i;
        break;
      }
      final.issues.push(...prefixIssues(i, r.issues));
    }
    final.value[i] = r.value;
  }
  for (let i = final.value.length - 1;i >= input.length; i--) {
    if (items[i]._zod.optout === "optional" && final.value[i] === undefined) {
      final.value.length = i;
    } else {
      break;
    }
  }
  return final;
}
var $ZodRecord = /* @__PURE__ */ $constructor("$ZodRecord", (inst, def) => {
  $ZodType.init(inst, def);
  const memo = globalConfig.memoizer;
  memo?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isPlainObject(input)) {
      payload.issues.push({
        expected: "record",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    const values = def.keyType._zod.values;
    if (values && !def.partial) {
      payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
      const recordKeys = new Set;
      for (const key of values) {
        if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
          recordKeys.add(typeof key === "number" ? key.toString() : key);
          if (key === "__proto__")
            continue;
          const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
          if (keyResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (keyResult.issues.length) {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
            continue;
          }
          const outKey = keyResult.value;
          if (outKey === "__proto__")
            continue;
          const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result) => {
              if (result.issues.length) {
                payload.issues.push(...prefixIssues(key, result.issues));
              }
              payload.value[outKey] = result.value;
            }));
          } else {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key, result.issues));
            }
            payload.value[outKey] = result.value;
          }
        }
      }
      let unrecognized;
      for (const key in input) {
        if (!recordKeys.has(key)) {
          if (def.mode === "loose") {
            if (key === "__proto__")
              continue;
            payload.value[key] = input[key];
          } else {
            unrecognized = unrecognized ?? [];
            unrecognized.push(key);
          }
        }
      }
      if (unrecognized && unrecognized.length > 0) {
        payload.issues.push({
          code: "unrecognized_keys",
          input,
          inst,
          keys: unrecognized,
          continue: true
        });
      }
    } else {
      payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
      let unrecognized;
      for (const key of Reflect.ownKeys(input)) {
        if (key === "__proto__")
          continue;
        if (!Object.prototype.propertyIsEnumerable.call(input, key))
          continue;
        let keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
        if (keyResult instanceof Promise) {
          throw new Error("Async schemas not supported in object keys currently");
        }
        const checkNumericKey = typeof key === "string" && number.test(key) && keyResult.issues.length;
        if (checkNumericKey) {
          const retryResult = def.keyType._zod.run({ value: Number(key), issues: [] }, ctx);
          if (retryResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (retryResult.issues.length === 0) {
            keyResult = retryResult;
          }
        }
        if (keyResult.issues.length) {
          if (def.mode === "loose") {
            payload.value[key] = input[key];
          } else if (values) {
            unrecognized = unrecognized ?? [];
            unrecognized.push(key);
          } else {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
          }
          continue;
        }
        const outKey = keyResult.value;
        if (outKey === "__proto__")
          continue;
        const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result) => {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key, result.issues));
            }
            payload.value[outKey] = result.value;
          }));
        } else {
          if (result.issues.length) {
            payload.issues.push(...prefixIssues(key, result.issues));
          }
          payload.value[outKey] = result.value;
        }
      }
      if (unrecognized && unrecognized.length > 0) {
        payload.issues.push({
          code: "unrecognized_keys",
          input,
          inst,
          keys: unrecognized,
          continue: true
        });
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
var $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
  $ZodType.init(inst, def);
  const values = getEnumValues(def.entries);
  const valuesSet = new Set(values);
  inst._zod.values = valuesSet;
  const patternValues = values.filter((k) => propertyKeyTypes.has(typeof k));
  inst._zod.pattern = new RegExp(patternValues.length ? `^(${patternValues.map((o) => escapeRegex(o.toString())).join("|")})$` : "^[^\\s\\S]$");
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (valuesSet.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  const values = new Set(def.values);
  inst._zod.values = values;
  inst._zod.pattern = new RegExp(def.values.length ? `^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$` : "^[^\\s\\S]$");
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values: def.values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodTransform = /* @__PURE__ */ $constructor("$ZodTransform", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  globalConfig.memoizer?.guard(inst);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    const _out = def.transform(payload.value, payload);
    if (ctx.async) {
      const output = _out instanceof Promise ? _out : Promise.resolve(_out);
      return output.then((output) => {
        payload.value = output;
        return payload;
      });
    }
    if (_out instanceof Promise) {
      throw new $ZodAsyncError;
    }
    payload.value = _out;
    return payload;
  };
});
function handleOptionalResult(payload, result) {
  payload.value = result.issues.length ? undefined : result.value;
  return payload;
}
var $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
  inst._zod.optout = "optional";
  defineLazyInternal(inst, "values", (zod) => {
    const values = zod.def.innerType._zod.values;
    return values ? new Set([...values, undefined]) : undefined;
  });
  defineLazyInternal(inst, "pattern", (zod) => {
    const pattern = zod.def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === undefined) {
      if (def.innerType._zod.optin !== "defaulted")
        return payload;
      const result = def.innerType._zod.run({ value: payload.value, issues: [] }, ctx);
      if (result instanceof Promise)
        return result.then((result) => handleOptionalResult(payload, result));
      return handleOptionalResult(payload, result);
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodExactOptional = /* @__PURE__ */ $constructor("$ZodExactOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
  defineLazyInternal(inst, "pattern", (zod) => zod.def.innerType._zod.pattern);
  inst._zod.parse = (payload, ctx) => {
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin);
  defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
  defineLazyInternal(inst, "pattern", (zod) => {
    const pattern = zod.def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : undefined;
  });
  defineLazyInternal(inst, "values", (zod) => {
    return zod.def.innerType._zod.values ? new Set([...zod.def.innerType._zod.values, null]) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === null)
      return payload;
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodDefault = /* @__PURE__ */ $constructor("$ZodDefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "defaulted";
  defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === undefined) {
      payload.value = def.defaultValue;
      return payload;
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result) => handleDefaultResult(result, def));
    }
    return handleDefaultResult(result, def);
  };
});
function handleDefaultResult(payload, def) {
  if (payload.value === undefined) {
    payload.value = def.defaultValue;
  }
  return payload;
}
var $ZodPrefault = /* @__PURE__ */ $constructor("$ZodPrefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "defaulted";
  defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === undefined) {
      payload.value = def.defaultValue;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNonOptional = /* @__PURE__ */ $constructor("$ZodNonOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "values", (zod) => {
    const v = zod.def.innerType._zod.values;
    return v ? new Set([...v].filter((x) => x !== undefined)) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result) => handleNonOptionalResult(result, inst));
    }
    return handleNonOptionalResult(result, inst);
  };
});
function handleNonOptionalResult(payload, inst) {
  if (!payload.issues.length && payload.value === undefined) {
    payload.issues.push({
      code: "invalid_type",
      expected: "nonoptional",
      input: payload.value,
      inst
    });
  }
  return payload;
}
function handleCatchResult(payload, result, def, ctx) {
  if (!result.issues.length) {
    payload.value = result.value;
    if (result.memo)
      payload.memo = true;
    return payload;
  }
  payload.value = def.catchValue({
    ...result,
    value: payload.value,
    error: {
      issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
    },
    input: payload.value
  });
  return payload;
}
var $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
  defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
  defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run({ value: payload.value, issues: [] }, ctx);
    if (result instanceof Promise) {
      return result.then((result) => handleCatchResult(payload, result, def, ctx));
    }
    return handleCatchResult(payload, result, def, ctx);
  };
});
var $ZodPipe = /* @__PURE__ */ $constructor("$ZodPipe", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "values", (zod) => zod.def.in._zod.values);
  defineLazyInternal(inst, "optin", (zod) => zod.def.in._zod.optin);
  defineLazyInternal(inst, "optout", (zod) => zod.def.out._zod.optout);
  defineLazyInternal(inst, "propValues", (zod) => zod.def.in._zod.propValues);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      const right = def.out._zod.run(payload, ctx);
      if (right instanceof Promise) {
        return right.then((right) => handlePipeResult(right, def.in, ctx));
      }
      return handlePipeResult(right, def.in, ctx);
    }
    const left = def.in._zod.run(payload, ctx);
    if (left instanceof Promise) {
      return left.then((left) => handlePipeResult(left, def.out, ctx));
    }
    return handlePipeResult(left, def.out, ctx);
  };
});
function handlePipeResult(left, next, ctx) {
  if (left.issues.some((iss) => iss.code !== "unrecognized_keys")) {
    left.aborted = true;
    return left;
  }
  return next._zod.run({ value: left.value, issues: left.issues }, ctx);
}
var $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "propValues", (zod) => zod.def.innerType._zod.propValues);
  defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType?._zod?.optin);
  defineLazyInternal(inst, "optout", (zod) => zod.def.innerType?._zod?.optout);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then(handleReadonlyResult);
    }
    return handleReadonlyResult(result);
  };
});
function handleReadonlyResult(payload) {
  if (!payload.memo)
    payload.value = Object.freeze(payload.value);
  return payload;
}
var $ZodLazy = /* @__PURE__ */ $constructor("$ZodLazy", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "innerType", () => {
    const d = def;
    if (!d._cachedInner)
      d._cachedInner = def.getter();
    return d._cachedInner;
  });
  defineLazyInternal(inst, "pattern", (zod) => zod.innerType?._zod?.pattern);
  defineLazyInternal(inst, "propValues", (zod) => zod.innerType?._zod?.propValues);
  defineLazyInternal(inst, "optin", (zod) => zod.innerType?._zod?.optin ?? undefined);
  defineLazyInternal(inst, "optout", (zod) => zod.innerType?._zod?.optout ?? undefined);
  inst._zod.parse = (payload, ctx) => {
    const inner = inst._zod.innerType;
    return inner._zod.run(payload, ctx);
  };
});
var $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
  $ZodCheck.init(inst, def);
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _) => {
    return payload;
  };
  inst._zod.check = (payload) => {
    const input = payload.value;
    const r = def.fn(input);
    if (r instanceof Promise) {
      return r.then((r) => handleRefineResult(r, payload, input, inst));
    }
    handleRefineResult(r, payload, input, inst);
    return;
  };
});
function handleRefineResult(result, payload, input, inst) {
  if (!result) {
    const _iss = {
      code: "custom",
      input,
      inst,
      path: [...inst._zod.def.path ?? []],
      continue: !inst._zod.def.abort
    };
    if (inst._zod.def.params)
      _iss.params = inst._zod.def.params;
    payload.issues.push(issue(_iss));
  }
}
// node_modules/zod/v4/core/memoizer.js
class $ZodCyclicError extends Error {
  constructor() {
    super(`Cannot parse a reference cycle that closes through a transform`);
    this.name = "ZodCyclicError";
  }
}
var STATE = "~memo";
var NO_ISSUES = [];
function cloneIssues(issues) {
  return issues.map((iss) => iss.path ? { ...iss, path: iss.path.slice() } : { ...iss });
}
var recursive = /* @__PURE__ */ new WeakMap;
function isRecursive(inst, stack) {
  const cached = recursive.get(inst);
  if (cached !== undefined)
    return cached;
  if (stack.has(inst))
    return true;
  stack.add(inst);
  let result = false;
  const check = (child) => {
    if (!result && child?._zod && isRecursive(child, stack))
      result = true;
  };
  const def = inst._zod.def;
  const kind = def.type;
  switch (kind) {
    case "object": {
      for (const key of Reflect.ownKeys(def.shape))
        check(def.shape[key]);
      check(def.catchall);
      break;
    }
    case "array":
      check(def.element);
      break;
    case "tuple":
      for (const el of def.items)
        check(el);
      check(def.rest);
      break;
    case "record":
    case "map":
      check(def.keyType);
      check(def.valueType);
      break;
    case "set":
      check(def.valueType);
      break;
    case "union":
      for (const el of def.options)
        check(el);
      break;
    case "intersection":
      check(def.left);
      check(def.right);
      break;
    case "optional":
    case "nullable":
    case "default":
    case "prefault":
    case "catch":
    case "readonly":
    case "nonoptional":
    case "promise":
    case "success":
      check(def.innerType);
      break;
    case "pipe":
      check(def.in);
      check(def.out);
      break;
    case "function":
      check(def.input);
      check(def.output);
      break;
    case "lazy":
      check(inst._zod.innerType);
      break;
    case "template_literal":
    case "string":
    case "number":
    case "int":
    case "boolean":
    case "bigint":
    case "symbol":
    case "undefined":
    case "null":
    case "void":
    case "never":
    case "any":
    case "unknown":
    case "date":
    case "nan":
    case "enum":
    case "literal":
    case "file":
    case "transform":
    case "custom":
      break;
    default: {
      for (const key in def) {
        const desc = Object.getOwnPropertyDescriptor(def, key);
        if (!desc || desc.get)
          continue;
        const value = desc.value;
        if (!value || typeof value !== "object")
          continue;
        if (value._zod)
          check(value);
        else if (Array.isArray(value))
          for (const el of value)
            check(el);
      }
    }
  }
  stack.delete(inst);
  recursive.set(inst, result);
  return result;
}
function bucketFor(state, inst) {
  let bucket = state.buckets.get(inst);
  if (!bucket) {
    bucket = new Map;
    state.buckets.set(inst, bucket);
  }
  return bucket;
}
var handoff;
var open = [];
var memo = {
  alloc(_inst, payload, empty) {
    const bucket = handoff;
    if (!bucket)
      return empty;
    handoff = undefined;
    const entry = { value: empty, issues: null };
    bucket.set(payload.value, entry);
    open.push(entry);
    return empty;
  },
  guard(inst) {
    var _a;
    (_a = inst._zod).deferred ?? (_a.deferred = []);
    inst._zod.deferred.push(() => {
      const base = inst._zod.parse;
      const wrapped = (payload, ctx) => {
        if (ctx.direction !== "backward" && isBackEdge(ctx, payload.value))
          throw new $ZodCyclicError;
        return base(payload, ctx);
      };
      inst._zod.parse = wrapped;
      if (inst._zod.run === base)
        inst._zod.run = wrapped;
    });
  },
  attach(inst) {
    var _a;
    let isRecursiveInst;
    let lastCtx;
    let lastBucket;
    (_a = inst._zod).deferred ?? (_a.deferred = []);
    inst._zod.deferred.push(() => {
      const base = inst._zod.parse;
      const wrapped = (payload, ctx) => {
        if (isRecursiveInst === undefined) {
          isRecursiveInst = isRecursive(inst, new Set);
          if (!isRecursiveInst) {
            inst._zod.parse = base;
            if (inst._zod.run === wrapped)
              inst._zod.run = base;
            return base(payload, ctx);
          }
        }
        const input = payload.value;
        if (input === null || typeof input !== "object")
          return base(payload, ctx);
        let state = ctx[STATE];
        if (!state) {
          state = { buckets: new Map, backEdges: undefined };
          ctx[STATE] = state;
        }
        let bucket;
        if (lastCtx === ctx) {
          bucket = lastBucket;
        } else {
          bucket = bucketFor(state, inst);
          lastCtx = ctx;
          lastBucket = bucket;
        }
        const hit = bucket.get(input);
        if (hit) {
          payload.value = hit.value;
          if (hit.issues) {
            if (hit.issues.length)
              payload.issues.push(...cloneIssues(hit.issues));
          } else {
            payload.memo = true;
            state.backEdges ?? (state.backEdges = new Set);
            state.backEdges.add(hit.value);
          }
          return payload;
        }
        handoff = bucket;
        const depth = open.length;
        const result = base(payload, ctx);
        handoff = undefined;
        const entry = open.length > depth ? open.pop() : undefined;
        if (result instanceof Promise) {
          return result.then((r) => {
            if (entry)
              entry.issues = r.issues.length ? cloneIssues(r.issues) : NO_ISSUES;
            return r;
          });
        }
        if (entry)
          entry.issues = result.issues.length ? cloneIssues(result.issues) : NO_ISSUES;
        return result;
      };
      inst._zod.parse = wrapped;
      if (inst._zod.run === base)
        inst._zod.run = wrapped;
    });
  }
};
function memoizer() {
  return memo;
}
function isBackEdge(ctx, value) {
  const backEdges = ctx[STATE]?.backEdges;
  return backEdges !== undefined && value !== null && typeof value === "object" && backEdges.has(value);
}
// node_modules/zod/v4/locales/en.js
var error = () => {
  const Sizable = {
    string: { unit: "characters", verb: "to have" },
    file: { unit: "bytes", verb: "to have" },
    array: { unit: "items", verb: "to have" },
    set: { unit: "items", verb: "to have" },
    map: { unit: "entries", verb: "to have" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "email address",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datetime",
    date: "ISO date",
    time: "ISO time",
    duration: "ISO duration",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    mac: "MAC address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded string",
    base64url: "base64url-encoded string",
    json_string: "JSON string",
    e164: "E.164 number",
    credit_card: "credit card number",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  function getTypeName(type, input) {
    if (type === "number" && typeof input === "number" && !Number.isFinite(input)) {
      return String(input);
    }
    return TypeDictionary[type] ?? type;
  }
  return (issue) => {
    switch (issue.code) {
      case "invalid_type": {
        const expected = getTypeName(issue.expected);
        const receivedType = parsedType(issue.input);
        const received = getTypeName(receivedType, issue.input);
        return `Invalid input: expected ${expected}, received ${received}`;
      }
      case "invalid_value":
        if (issue.values.length === 1)
          return `Invalid input: expected ${stringifyPrimitive(issue.values[0])}`;
        return `Invalid option: expected one of ${joinValues(issue.values, "|")}`;
      case "too_big": {
        const adj = issue.exact ? "exactly " : issue.inclusive ? "<=" : "<";
        const sizing = getSizing(issue.origin);
        if (sizing)
          return `Too big: expected ${issue.origin ?? "value"} to have ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elements"}`;
        return `Too big: expected ${issue.origin ?? "value"} to be ${adj}${issue.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue.exact ? "exactly " : issue.inclusive ? ">=" : ">";
        const sizing = getSizing(issue.origin);
        if (sizing) {
          return `Too small: expected ${issue.origin} to have ${adj}${issue.minimum.toString()} ${sizing.unit}`;
        }
        return `Too small: expected ${issue.origin} to be ${adj}${issue.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue;
        if (_issue.format === "starts_with") {
          return `Invalid string: must start with "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Invalid string: must end with "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Invalid string: must include "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Invalid string: must match pattern ${_issue.pattern}`;
        return `Invalid ${FormatDictionary[_issue.format] ?? issue.format}`;
      }
      case "not_multiple_of":
        return `Invalid number: must be a multiple of ${issue.divisor}`;
      case "unrecognized_keys":
        return `Unrecognized key${issue.keys.length > 1 ? "s" : ""}: ${joinValues(issue.keys, ", ")}`;
      case "invalid_key":
        return `Invalid key in ${issue.origin}`;
      case "invalid_union":
        if (issue.options && Array.isArray(issue.options) && issue.options.length > 0) {
          const opts = issue.options.map((o) => `'${o}'`).join(" | ");
          return `Invalid discriminator value. Expected ${opts}`;
        }
        if (issue.inclusive === false) {
          return "Invalid input: more than one option matched";
        }
        return "Invalid input";
      case "invalid_element":
        return `Invalid value in ${issue.origin}`;
      default:
        return `Invalid input`;
    }
  };
};
function en_default() {
  return {
    localeError: error()
  };
}
// node_modules/zod/v4/core/registries.js
var _a2;
class $ZodRegistry {
  constructor() {
    this._map = new WeakMap;
    this._idmap = new Map;
  }
  add(schema, ..._meta) {
    const meta = _meta[0];
    this._map.set(schema, meta);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.set(meta.id, schema);
    }
    return this;
  }
  clear() {
    this._map = new WeakMap;
    this._idmap = new Map;
    return this;
  }
  remove(schema) {
    const meta = this._map.get(schema);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.delete(meta.id);
    }
    this._map.delete(schema);
    return this;
  }
  get(schema) {
    const p = schema._zod.parent;
    if (p) {
      const pm = { ...this.get(p) ?? {} };
      delete pm.id;
      const f = { ...pm, ...this._map.get(schema) };
      return Object.keys(f).length ? f : undefined;
    }
    return this._map.get(schema);
  }
  has(schema) {
    return this._map.has(schema);
  }
}
function registry() {
  return new $ZodRegistry;
}
(_a2 = globalThis).__zod_globalRegistry ?? (_a2.__zod_globalRegistry = registry());
var globalRegistry = globalThis.__zod_globalRegistry;
// node_modules/zod/v4/core/api.js
function _string(Class, params) {
  return new Class({
    type: "string",
    ...normalizeParams(params)
  });
}
function _email(Class, params) {
  return new Class({
    type: "string",
    format: "email",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _guid(Class, params) {
  return new Class({
    type: "string",
    format: "guid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuid(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuidv4(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v4",
    ...normalizeParams(params)
  });
}
function _uuidv6(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v6",
    ...normalizeParams(params)
  });
}
function _uuidv7(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v7",
    ...normalizeParams(params)
  });
}
function _url(Class, params) {
  return new Class({
    type: "string",
    format: "url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _emoji2(Class, params) {
  return new Class({
    type: "string",
    format: "emoji",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _nanoid(Class, params) {
  return new Class({
    type: "string",
    format: "nanoid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid(Class, params) {
  return new Class({
    type: "string",
    format: "cuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid2(Class, params) {
  return new Class({
    type: "string",
    format: "cuid2",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ulid(Class, params) {
  return new Class({
    type: "string",
    format: "ulid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _xid(Class, params) {
  return new Class({
    type: "string",
    format: "xid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ksuid(Class, params) {
  return new Class({
    type: "string",
    format: "ksuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv4(Class, params) {
  return new Class({
    type: "string",
    format: "ipv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv6(Class, params) {
  return new Class({
    type: "string",
    format: "ipv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv4(Class, params) {
  return new Class({
    type: "string",
    format: "cidrv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv6(Class, params) {
  return new Class({
    type: "string",
    format: "cidrv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64(Class, params) {
  return new Class({
    type: "string",
    format: "base64",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64url(Class, params) {
  return new Class({
    type: "string",
    format: "base64url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _e164(Class, params) {
  return new Class({
    type: "string",
    format: "e164",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _jwt(Class, params) {
  return new Class({
    type: "string",
    format: "jwt",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _isoDateTime(Class, params) {
  return new Class({
    type: "string",
    format: "datetime",
    check: "string_format",
    offset: false,
    local: false,
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDate(Class, params) {
  return new Class({
    type: "string",
    format: "date",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _isoTime(Class, params) {
  return new Class({
    type: "string",
    format: "time",
    check: "string_format",
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDuration(Class, params) {
  return new Class({
    type: "string",
    format: "duration",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _number(Class, params) {
  return new Class({
    type: "number",
    checks: [],
    ...normalizeParams(params)
  });
}
function _int(Class, params) {
  return new Class({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params)
  });
}
function _boolean(Class, params) {
  return new Class({
    type: "boolean",
    ...normalizeParams(params)
  });
}
function _unknown(Class) {
  return new Class({
    type: "unknown"
  });
}
function _never(Class, params) {
  return new Class({
    type: "never",
    ...normalizeParams(params)
  });
}
function _lt(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _lte(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _gt(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _multipleOf(value, params) {
  return new $ZodCheckMultipleOf({
    check: "multiple_of",
    ...normalizeParams(params),
    value
  });
}
function _maxLength(maximum, params) {
  const ch = new $ZodCheckMaxLength({
    check: "max_length",
    ...normalizeParams(params),
    maximum
  });
  return ch;
}
function _minLength(minimum, params) {
  return new $ZodCheckMinLength({
    check: "min_length",
    ...normalizeParams(params),
    minimum
  });
}
function _length(length, params) {
  return new $ZodCheckLengthEquals({
    check: "length_equals",
    ...normalizeParams(params),
    length
  });
}
function _regex(pattern, params) {
  return new $ZodCheckRegex({
    check: "string_format",
    format: "regex",
    ...normalizeParams(params),
    pattern
  });
}
function _lowercase(params) {
  return new $ZodCheckLowerCase({
    check: "string_format",
    format: "lowercase",
    ...normalizeParams(params)
  });
}
function _uppercase(params) {
  return new $ZodCheckUpperCase({
    check: "string_format",
    format: "uppercase",
    ...normalizeParams(params)
  });
}
function _includes(includes, params) {
  return new $ZodCheckIncludes({
    check: "string_format",
    format: "includes",
    ...normalizeParams(params),
    includes
  });
}
function _startsWith(prefix, params) {
  return new $ZodCheckStartsWith({
    check: "string_format",
    format: "starts_with",
    ...normalizeParams(params),
    prefix
  });
}
function _endsWith(suffix, params) {
  return new $ZodCheckEndsWith({
    check: "string_format",
    format: "ends_with",
    ...normalizeParams(params),
    suffix
  });
}
function _overwrite(tx) {
  return new $ZodCheckOverwrite({
    check: "overwrite",
    tx
  });
}
function _normalize(form) {
  return _overwrite((input) => input.normalize(form));
}
function _trim() {
  return _overwrite((input) => input.trim());
}
function _toLowerCase() {
  return _overwrite((input) => input.toLowerCase());
}
function _toUpperCase() {
  return _overwrite((input) => input.toUpperCase());
}
function _slugify() {
  return _overwrite((input) => slugify(input));
}
function _array(Class, element, params) {
  return new Class({
    type: "array",
    element,
    ...normalizeParams(params)
  });
}
function _refine(Class, fn, _params) {
  const schema = new Class({
    type: "custom",
    check: "custom",
    fn,
    ...normalizeParams(_params)
  });
  return schema;
}
function _superRefine(fn, params) {
  const ch = _check((payload) => {
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(issue(issue2, payload.value, ch._zod.def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        if (!("input" in _issue))
          _issue.input = payload.value;
        _issue.inst ?? (_issue.inst = ch);
        _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
        payload.issues.push(issue(_issue));
      }
    };
    return fn(payload.value, payload);
  }, params);
  return ch;
}
function _check(fn, params) {
  const ch = new $ZodCheck({
    check: "custom",
    ...normalizeParams(params)
  });
  ch._zod.check = fn;
  return ch;
}
// node_modules/zod/v4/core/to-json-schema.js
function assignProps(target, ...sources) {
  for (const source of sources) {
    for (const key of Reflect.ownKeys(source)) {
      if (Object.prototype.propertyIsEnumerable.call(source, key)) {
        assignProp(target, key, source[key]);
      }
    }
  }
  return target;
}
function initializeContext(params) {
  let target = params?.target ?? "draft-2020-12";
  if (target === "draft-4")
    target = "draft-04";
  if (target === "draft-7")
    target = "draft-07";
  return {
    processors: params.processors ?? {},
    metadataRegistry: params?.metadata ?? globalRegistry,
    target,
    unrepresentable: params?.unrepresentable ?? "throw",
    override: params?.override ?? (() => {}),
    io: params?.io ?? "output",
    counter: 0,
    seen: new Map,
    sharedDefsExtractedFor: undefined,
    sharedEmitDoneFor: undefined,
    cycles: params?.cycles ?? "ref",
    reused: params?.reused ?? "inline",
    intersections: [],
    deferred: [],
    external: params?.external ?? undefined
  };
}
function handleUnrepresentable(schema, ctx, json, params, message) {
  const result = typeof ctx.unrepresentable === "function" ? ctx.unrepresentable({ zodSchema: schema, path: params.path, message }) : ctx.unrepresentable;
  if (result === "any")
    return false;
  if (result === undefined || result === "throw")
    throw new Error(message);
  Object.assign(json, result);
  return true;
}
function process(schema, ctx, _params = { path: [], schemaPath: [] }) {
  var _a;
  const def = schema._zod.def;
  const seen = ctx.seen.get(schema);
  if (seen) {
    seen.count++;
    const isCycle = _params.schemaPath.includes(schema);
    if (isCycle) {
      seen.cycle = _params.path;
    }
    return seen.schema;
  }
  const result = { schema: {}, count: 1, cycle: undefined, path: _params.path };
  ctx.seen.set(schema, result);
  ctx.sharedDefsExtractedFor = undefined;
  ctx.sharedEmitDoneFor = undefined;
  const overrideSchema = schema._zod.toJSONSchema?.();
  if (overrideSchema) {
    result.schema = overrideSchema;
  } else {
    const params = {
      ..._params,
      schemaPath: [..._params.schemaPath, schema],
      path: _params.path
    };
    if (schema._zod.processJSONSchema) {
      schema._zod.processJSONSchema(ctx, result.schema, params);
    } else {
      const _json = result.schema;
      const processor = ctx.processors[def.type];
      if (!processor) {
        throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
      }
      processor(schema, ctx, _json, params);
    }
    const parent = schema._zod.parent;
    if (parent) {
      if (!result.ref)
        result.ref = parent;
      process(parent, ctx, params);
      ctx.seen.get(parent).isParent = true;
    }
  }
  const meta = ctx.metadataRegistry.get(schema);
  if (meta)
    assignProps(result.schema, meta);
  if (ctx.io === "input" && isTransforming(schema)) {
    delete result.schema.examples;
    delete result.schema.default;
  }
  if (ctx.io === "input" && "_prefault" in result.schema)
    (_a = result.schema).default ?? (_a.default = result.schema._prefault);
  delete result.schema._prefault;
  const _result = ctx.seen.get(schema);
  return _result.schema;
}
function encodeJSONPointerSegment(segment) {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}
function extractDefs(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  if (ctx.external && ctx.sharedDefsExtractedFor === ctx.external)
    return;
  const idToSchema = new Map;
  for (const entry of ctx.seen.entries()) {
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      const existing = idToSchema.get(id);
      if (existing && existing !== entry[0]) {
        throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
      }
      idToSchema.set(id, entry[0]);
    }
  }
  const makeURI = (entry) => {
    const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
    if (ctx.external) {
      const externalId = ctx.external.registry.get(entry[0])?.id;
      const uriGenerator = ctx.external.uri ?? ((id) => id);
      if (externalId) {
        return { ref: uriGenerator(externalId) };
      }
      const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
      entry[1].defId = id;
      return { defId: id, ref: `${uriGenerator("__shared")}#/${defsSegment}/${encodeJSONPointerSegment(id)}` };
    }
    const uriPrefix = `#`;
    const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
    if (entry[1] === root && !entry[1].schema.id) {
      return { ref: uriPrefix };
    }
    const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
    return { defId, ref: defUriPrefix + encodeJSONPointerSegment(defId) };
  };
  const extractToDef = (entry) => {
    if (entry[1].schema.$ref) {
      return;
    }
    const seen = entry[1];
    const { ref, defId } = makeURI(entry);
    seen.def = { ...seen.schema };
    if (defId)
      seen.defId = defId;
    const schema = seen.schema;
    for (const key in schema) {
      delete schema[key];
    }
    schema.$ref = ref;
  };
  if (ctx.cycles === "throw") {
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (seen.cycle) {
        throw new Error("Cycle detected: " + `#/${seen.cycle?.join("/")}/<root>` + '\n\nSet the `cycles` parameter to `"ref"` to resolve cyclical schemas with defs.');
      }
    }
  }
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (schema === entry[0]) {
      extractToDef(entry);
      continue;
    }
    if (ctx.external) {
      const ext = ctx.external.registry.get(entry[0])?.id;
      if (schema !== entry[0] && ext) {
        extractToDef(entry);
        continue;
      }
    }
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      extractToDef(entry);
      continue;
    }
    if (seen.cycle) {
      extractToDef(entry);
      continue;
    }
    if (seen.count > 1) {
      if (ctx.reused === "ref") {
        extractToDef(entry);
        continue;
      }
    }
  }
  if (ctx.external)
    ctx.sharedDefsExtractedFor = ctx.external;
}
function compactTypeUnion(schema) {
  const options = schema.anyOf;
  if (!Array.isArray(options) || options.length === 0 || schema.type !== undefined)
    return;
  const types = [];
  for (const option of options) {
    if (!option || typeof option !== "object")
      return;
    compactTypeUnion(option);
    const keys = Object.keys(option);
    if (keys.length !== 1 || keys[0] !== "type")
      return;
    const type = option.type;
    for (const member of Array.isArray(type) ? type : [type]) {
      if (typeof member !== "string")
        return;
      if (!types.includes(member))
        types.push(member);
    }
  }
  delete schema.anyOf;
  schema.type = types.length === 1 ? types[0] : types;
}
var FOLDABLE_KEYS = new Set(["type", "properties", "required", "additionalProperties"]);
var UNION_KEYS = ["oneOf", "anyOf"];
function undeclaredConstraint(member) {
  const extra = member.additionalProperties;
  if (extra === undefined || extra === false || typeof extra !== "object" || extra === null)
    return null;
  return Object.keys(extra).length ? extra : null;
}
function foldObjects(members) {
  const objects = [];
  for (const member of members) {
    if (typeof member !== "object" || member.type !== "object")
      return null;
    for (const key in member) {
      if (!FOLDABLE_KEYS.has(key))
        return null;
    }
    objects.push(member);
  }
  const properties = {};
  const required = new Set;
  for (const object of objects) {
    for (const key in object.properties) {
      if (Object.prototype.hasOwnProperty.call(properties, key))
        continue;
      const parts = [];
      for (const other of objects) {
        const part = other.properties?.[key] ?? undeclaredConstraint(other);
        if (part === null || part === undefined)
          continue;
        if (!parts.some((seen) => JSON.stringify(seen) === JSON.stringify(part)))
          parts.push(part);
      }
      const merged = parts.length === 1 ? parts[0] : foldObjects(parts) ?? { allOf: parts };
      assignProp(properties, key, merged);
    }
    for (const key of object.required ?? [])
      required.add(key);
  }
  const folded = { type: "object", properties };
  if (required.size)
    folded.required = [...required];
  if (objects.every((object) => object.additionalProperties === false)) {
    folded.additionalProperties = false;
  } else {
    const constraints = [];
    for (const object of objects) {
      const constraint = undeclaredConstraint(object);
      if (constraint && !constraints.some((seen) => JSON.stringify(seen) === JSON.stringify(constraint)))
        constraints.push(constraint);
    }
    if (constraints.length === 1)
      folded.additionalProperties = constraints[0];
    else if (constraints.length > 1)
      folded.additionalProperties = { allOf: constraints };
  }
  return folded;
}
function foldIntersection(json) {
  const allOf = json.allOf;
  if (!Array.isArray(allOf) || allOf.length < 2)
    return;
  for (const key of FOLDABLE_KEYS)
    if (key in json)
      return;
  const unions = allOf.filter((m) => UNION_KEYS.some((k) => Array.isArray(m[k])));
  let folded = null;
  if (!unions.length) {
    folded = foldObjects(allOf);
  } else {
    const union = unions[0];
    const keyword = UNION_KEYS.find((k) => Array.isArray(union[k]));
    if (Object.keys(union).length !== 1)
      return;
    const rest = allOf.filter((m) => m !== union);
    const branches = union[keyword].map((branch) => foldObjects([...rest, branch]));
    if (branches.some((b) => !b))
      return;
    folded = { [keyword]: branches };
  }
  if (!folded)
    return;
  delete json.allOf;
  assignProps(json, folded);
}
function finalize(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const flattenRef = (zodSchema) => {
    const seen = ctx.seen.get(zodSchema);
    if (seen.ref === null)
      return;
    const schema = seen.def ?? seen.schema;
    const _cached = { ...schema };
    const ref = seen.ref;
    seen.ref = null;
    if (ref) {
      flattenRef(ref);
      const refSeen = ctx.seen.get(ref);
      const refSchema = refSeen.schema;
      if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
        schema.allOf = schema.allOf ?? [];
        schema.allOf.push(refSchema);
      } else {
        assignProps(schema, refSchema);
      }
      assignProps(schema, _cached);
      const isParentRef = zodSchema._zod.parent === ref;
      if (isParentRef) {
        for (const key in schema) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (!(key in _cached)) {
            delete schema[key];
          }
        }
      }
      if (refSchema.$ref && refSeen.def) {
        for (const key in schema) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) {
            delete schema[key];
          }
        }
      }
    }
    const parent = zodSchema._zod.parent;
    if (parent && parent !== ref) {
      flattenRef(parent);
      const parentSeen = ctx.seen.get(parent);
      if (parentSeen?.schema.$ref) {
        schema.$ref = parentSeen.schema.$ref;
        if (parentSeen.def) {
          for (const key in schema) {
            if (key === "$ref" || key === "allOf")
              continue;
            if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) {
              delete schema[key];
            }
          }
        }
      }
    }
    ctx.override({
      zodSchema,
      jsonSchema: schema,
      path: seen.path ?? []
    });
  };
  if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
    for (const entry of [...ctx.seen.entries()].reverse()) {
      flattenRef(entry[0]);
    }
    if (ctx.target !== "openapi-3.0") {
      for (const entry of ctx.seen.entries()) {
        compactTypeUnion(entry[1].def ?? entry[1].schema);
      }
    }
    for (const rewrite of ctx.deferred)
      rewrite();
    if (ctx.intersections.length) {
      const carriers = new Map;
      for (const seen of ctx.seen.values()) {
        for (const json of [seen.schema, seen.def]) {
          const allOf = json?.allOf;
          if (!Array.isArray(allOf))
            continue;
          const existing = carriers.get(allOf);
          if (existing)
            existing.push(json);
          else
            carriers.set(allOf, [json]);
        }
      }
      for (const allOf of ctx.intersections) {
        for (const json of carriers.get(allOf) ?? [])
          foldIntersection(json);
      }
    }
  }
  const result = {};
  if (ctx.target === "draft-2020-12") {
    result.$schema = "https://json-schema.org/draft/2020-12/schema";
  } else if (ctx.target === "draft-07") {
    result.$schema = "http://json-schema.org/draft-07/schema#";
  } else if (ctx.target === "draft-04") {
    result.$schema = "http://json-schema.org/draft-04/schema#";
  } else if (ctx.target === "openapi-3.0") {}
  if (ctx.external?.uri) {
    const id = ctx.external.registry.get(schema)?.id;
    if (!id)
      throw new Error("Schema is missing an `id` property");
    result.$id = ctx.external.uri(id);
  }
  assignProps(result, root.defId ? root.schema : root.def ?? root.schema);
  const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
  if (rootMetaId !== undefined && result.id === rootMetaId)
    delete result.id;
  const defs = ctx.external?.defs ?? {};
  if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (seen.def && seen.defId) {
        if (seen.def.id === seen.defId)
          delete seen.def.id;
        assignProp(defs, seen.defId, seen.def);
      }
    }
  }
  if (ctx.external)
    ctx.sharedEmitDoneFor = ctx.external;
  if (ctx.external) {} else {
    if (Object.keys(defs).length > 0) {
      if (ctx.target === "draft-2020-12") {
        result.$defs = defs;
      } else {
        result.definitions = defs;
      }
    }
  }
  try {
    const finalized = JSON.parse(JSON.stringify(result));
    Object.defineProperty(finalized, "~standard", {
      value: {
        ...schema["~standard"],
        jsonSchema: {
          input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
          output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
        }
      },
      enumerable: false,
      writable: false
    });
    return finalized;
  } catch (_err) {
    throw new Error("Error converting schema to JSON.");
  }
}
function isTransforming(_schema, _ctx) {
  const ctx = _ctx ?? { seen: new Set };
  if (ctx.seen.has(_schema))
    return false;
  ctx.seen.add(_schema);
  const def = _schema._zod.def;
  if (def.type === "transform")
    return true;
  if (def.type === "array")
    return isTransforming(def.element, ctx);
  if (def.type === "set")
    return isTransforming(def.valueType, ctx);
  if (def.type === "lazy")
    return isTransforming(def.getter(), ctx);
  if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault" || def.type === "catch") {
    return isTransforming(def.innerType, ctx);
  }
  if (def.type === "intersection") {
    return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
  }
  if (def.type === "record" || def.type === "map") {
    return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
  }
  if (def.type === "pipe") {
    if (_schema._zod.traits.has("$ZodCodec"))
      return true;
    return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
  }
  if (def.type === "object") {
    for (const key in def.shape) {
      if (isTransforming(def.shape[key], ctx))
        return true;
    }
    return false;
  }
  if (def.type === "union") {
    for (const option of def.options) {
      if (isTransforming(option, ctx))
        return true;
    }
    return false;
  }
  if (def.type === "tuple") {
    for (const item of def.items) {
      if (isTransforming(item, ctx))
        return true;
    }
    if (def.rest && isTransforming(def.rest, ctx))
      return true;
    return false;
  }
  return false;
}
var createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
  const ctx = initializeContext({ ...params, processors });
  process(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};
var createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
  const { libraryOptions, target } = params ?? {};
  const ctx = initializeContext({ ...libraryOptions ?? {}, target, io, processors });
  process(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};
// node_modules/zod/v4/core/json-schema-processors.js
var formatMap = {
  guid: "uuid",
  url: "uri",
  datetime: "date-time",
  json_string: "json-string",
  regex: ""
};
var stringProcessor = (schema, ctx, _json, _params) => {
  const json = _json;
  json.type = "string";
  const { minimum, maximum, format, patterns, contentEncoding, laxFormat } = schema._zod.bag;
  if (typeof minimum === "number")
    json.minLength = minimum;
  if (typeof maximum === "number")
    json.maxLength = maximum;
  if (format) {
    json.format = formatMap[format] ?? format;
    if (json.format === "")
      delete json.format;
    if (format === "time" || laxFormat) {
      delete json.format;
    }
  }
  if (contentEncoding)
    json.contentEncoding = contentEncoding;
  if (patterns && patterns.size > 0) {
    const patternList = [...patterns];
    if (patternList.length === 1)
      json.pattern = patternList[0].source;
    else if (patternList.length > 1) {
      json.allOf = [
        ...patternList.map((regex) => ({
          ...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
          pattern: regex.source
        }))
      ];
    }
  }
};
var numberProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
  if (typeof format === "string" && format.includes("int"))
    json.type = "integer";
  else
    json.type = "number";
  const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
  const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
  const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
  if (exMin) {
    if (legacy) {
      json.minimum = exclusiveMinimum;
      json.exclusiveMinimum = true;
    } else {
      json.exclusiveMinimum = exclusiveMinimum;
    }
  } else if (typeof minimum === "number") {
    json.minimum = minimum;
  }
  if (exMax) {
    if (legacy) {
      json.maximum = exclusiveMaximum;
      json.exclusiveMaximum = true;
    } else {
      json.exclusiveMaximum = exclusiveMaximum;
    }
  } else if (typeof maximum === "number") {
    json.maximum = maximum;
  }
  if (typeof multipleOf === "number") {
    if (Number.isFinite(multipleOf) && multipleOf !== 0)
      json.multipleOf = Math.abs(multipleOf);
    else
      handleUnrepresentable(schema, ctx, json, params, `A multipleOf divisor of ${multipleOf} cannot be represented in JSON Schema`);
  }
};
var booleanProcessor = (_schema, _ctx, json, _params) => {
  json.type = "boolean";
};
var neverProcessor = (_schema, _ctx, json, _params) => {
  json.not = {};
};
var unknownProcessor = (_schema, _ctx, _json, _params) => {};
var enumProcessor = (schema, _ctx, json, _params) => {
  const def = schema._zod.def;
  const values = getEnumValues(def.entries);
  if (values.length === 0) {
    json.not = {};
    return;
  }
  if (values.every((v) => typeof v === "number"))
    json.type = "number";
  if (values.every((v) => typeof v === "string"))
    json.type = "string";
  json.enum = values;
};
var literalProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  if (def.values.length === 0) {
    json.not = {};
    return;
  }
  const vals = [];
  for (const val of def.values) {
    if (val === undefined) {
      if (handleUnrepresentable(schema, ctx, json, params, "Literal `undefined` cannot be represented in JSON Schema"))
        return;
    } else if (typeof val === "bigint") {
      if (handleUnrepresentable(schema, ctx, json, params, "BigInt literals cannot be represented in JSON Schema"))
        return;
      vals.push(Number(val));
    } else {
      vals.push(val);
    }
  }
  if (vals.length === 0) {} else if (vals.length === 1) {
    const val = vals[0];
    json.type = val === null ? "null" : typeof val;
    if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") {
      json.enum = [val];
    } else {
      json.const = val;
    }
  } else {
    if (vals.every((v) => typeof v === "number"))
      json.type = "number";
    if (vals.every((v) => typeof v === "string"))
      json.type = "string";
    if (vals.every((v) => typeof v === "boolean"))
      json.type = "boolean";
    if (vals.every((v) => v === null))
      json.type = "null";
    json.enum = vals;
  }
};
var customProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Custom types cannot be represented in JSON Schema");
};
var transformProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Transforms cannot be represented in JSON Schema");
};
var arrayProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  const { minimum, maximum } = schema._zod.bag;
  if (typeof minimum === "number")
    json.minItems = minimum;
  if (typeof maximum === "number")
    json.maxItems = maximum;
  json.type = "array";
  json.items = process(def.element, ctx, {
    ...params,
    path: [...params.path, "items"]
  });
};
function inputOptin(schema) {
  const def = schema._zod.def;
  if (def.type === "pipe" && def.in._zod.traits.has("$ZodTransform")) {
    return inputOptin(def.out);
  }
  if (def.type === "catch") {
    return inputOptin(def.innerType);
  }
  return schema._zod.optin;
}
var objectProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  const shape = def.shape;
  const symbolKeys = Object.getOwnPropertySymbols(shape);
  if (symbolKeys.length && handleUnrepresentable(schema, ctx, json, params, "Symbol keys cannot be represented in JSON Schema")) {
    return;
  }
  json.type = "object";
  json.properties = {};
  for (const key in shape) {
    assignProp(json.properties, key, process(shape[key], ctx, {
      ...params,
      path: [...params.path, "properties", key]
    }));
  }
  const allKeys = new Set(Object.keys(shape));
  const requiredKeys = new Set([...allKeys].filter((key) => {
    const field = def.shape[key];
    if (ctx.io === "input") {
      return inputOptin(field) === undefined;
    } else {
      return field._zod.optout === undefined;
    }
  }));
  if (requiredKeys.size > 0) {
    json.required = Array.from(requiredKeys);
  }
  if (def.catchall?._zod.def.type === "never") {
    json.additionalProperties = false;
  } else if (!def.catchall) {
    if (ctx.io === "output")
      json.additionalProperties = false;
  } else if (def.catchall) {
    json.additionalProperties = process(def.catchall, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"]
    });
  }
};
var unionProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const isExclusive = def.inclusive === false;
  const options = def.options.map((x, i) => process(x, ctx, {
    ...params,
    path: [...params.path, isExclusive ? "oneOf" : "anyOf", i]
  }));
  if (isExclusive) {
    json.oneOf = options;
  } else {
    json.anyOf = options;
  }
};
var intersectionProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const a = process(def.left, ctx, {
    ...params,
    path: [...params.path, "allOf", 0]
  });
  const b = process(def.right, ctx, {
    ...params,
    path: [...params.path, "allOf", 1]
  });
  const isSimpleIntersection = (val) => ("allOf" in val) && Object.keys(val).length === 1;
  const allOf = [
    ...isSimpleIntersection(a) ? a.allOf : [a],
    ...isSimpleIntersection(b) ? b.allOf : [b]
  ];
  json.allOf = allOf;
  ctx.intersections.push(allOf);
};
var tupleProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  json.type = "array";
  const prefixPath = ctx.target === "draft-2020-12" ? "prefixItems" : "items";
  const restPath = ctx.target === "draft-2020-12" ? "items" : ctx.target === "openapi-3.0" ? "items" : "additionalItems";
  const prefixItems = def.items.map((x, i) => process(x, ctx, {
    ...params,
    path: [...params.path, prefixPath, i]
  }));
  const rest = def.rest ? process(def.rest, ctx, {
    ...params,
    path: [...params.path, restPath, ...ctx.target === "openapi-3.0" ? [def.items.length] : []]
  }) : null;
  let minItems = def.items.length;
  while (minItems > 0) {
    const item = def.items[minItems - 1];
    const optional = ctx.io === "input" ? inputOptin(item) !== undefined : item._zod.optout === "optional";
    if (!optional)
      break;
    minItems--;
  }
  const maxItems = def.items.length;
  const isClosed = !def.rest;
  if (ctx.target === "draft-2020-12") {
    json.prefixItems = prefixItems;
    if (isClosed) {
      json.items = false;
    } else if (rest) {
      json.items = rest;
    }
    if (minItems > 0)
      json.minItems = minItems;
    if (isClosed)
      json.maxItems = maxItems;
  } else if (ctx.target === "openapi-3.0") {
    json.items = {
      anyOf: prefixItems
    };
    if (rest) {
      json.items.anyOf.push(rest);
    }
    if (minItems > 0)
      json.minItems = minItems;
    if (isClosed)
      json.maxItems = maxItems;
  } else {
    json.items = prefixItems;
    if (isClosed) {
      json.additionalItems = false;
    } else if (rest) {
      json.additionalItems = rest;
    }
    if (minItems > 0)
      json.minItems = minItems;
    if (isClosed)
      json.maxItems = maxItems;
  }
  const { minimum, maximum } = schema._zod.bag;
  if (typeof minimum === "number")
    json.minItems = minimum;
  if (typeof maximum === "number")
    json.maxItems = maximum;
};
function stringifyKeyNames(bySchema, json, visited) {
  if (json.$ref) {
    if (visited.has(json))
      return json;
    visited.add(json);
    const def = bySchema.get(json)?.def;
    if (!def)
      return json;
    const inlined = stringifyKeyNames(bySchema, def, visited);
    return inlined === def ? json : inlined;
  }
  for (const keyword of ["anyOf", "oneOf"]) {
    const branches = json[keyword];
    if (!Array.isArray(branches))
      continue;
    const mapped = branches.map((branch) => stringifyKeyNames(bySchema, branch, visited));
    if (mapped.some((branch, i) => branch !== branches[i]))
      json = { ...json, [keyword]: mapped };
  }
  const types = Array.isArray(json.type) ? json.type : [json.type];
  const numericType = !types.includes("string") && types.some((t) => t === "number" || t === "integer");
  const values = json.enum ?? (json.const !== undefined ? [json.const] : undefined);
  if (!numericType && !values?.some((v) => typeof v === "number"))
    return json;
  const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf, format, id, ...rest } = json;
  if (rest.enum)
    rest.enum = rest.enum.map((v) => typeof v === "number" ? String(v) : v);
  else if (typeof rest.const === "number")
    rest.const = String(rest.const);
  if (!numericType)
    return rest;
  rest.type = "string";
  if (!values)
    rest.pattern = (types.includes("number") ? number : integer).source;
  return rest;
}
var pendingRecords = new WeakMap;
function rewriteKeyNames(ctx) {
  const bySchema = new Map;
  for (const entry of ctx.seen.values()) {
    if (entry.def && !bySchema.has(entry.schema))
      bySchema.set(entry.schema, entry);
  }
  const rewrites = new Map;
  for (const record of pendingRecords.get(ctx) ?? []) {
    const seen = ctx.seen.get(record);
    const names = (seen?.def ?? seen?.schema)?.propertyNames;
    if (!names || names === true || rewrites.has(names))
      continue;
    const rewritten = stringifyKeyNames(bySchema, names, new Set);
    if (rewritten !== names)
      rewrites.set(names, rewritten);
  }
  if (!rewrites.size)
    return;
  for (const entry of ctx.seen.values()) {
    for (const carrier of [entry.schema, entry.def]) {
      const rewritten = carrier && rewrites.get(carrier.propertyNames);
      if (rewritten)
        carrier.propertyNames = rewritten;
    }
  }
}
var recordProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  json.type = "object";
  const keyType = def.keyType;
  const keyBag = keyType._zod.bag;
  const patterns = keyBag?.patterns;
  if (def.mode === "loose" && patterns && patterns.size > 0) {
    const valueSchema = process(def.valueType, ctx, {
      ...params,
      path: [...params.path, "patternProperties", "*"]
    });
    json.patternProperties = {};
    for (const pattern of patterns) {
      assignProp(json.patternProperties, pattern.source, valueSchema);
    }
  } else {
    if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
      json.propertyNames = process(def.keyType, ctx, {
        ...params,
        path: [...params.path, "propertyNames"]
      });
      let pending = pendingRecords.get(ctx);
      if (!pending) {
        pending = [];
        pendingRecords.set(ctx, pending);
        ctx.deferred.push(() => rewriteKeyNames(ctx));
      }
      pending.push(schema);
    }
    json.additionalProperties = process(def.valueType, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"]
    });
  }
  const keyValues = keyType._zod.values;
  const omittableOnInput = ctx.io === "input" && inputOptin(def.valueType) !== undefined;
  if (keyValues && !def.partial && !omittableOnInput) {
    const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
    if (validKeyValues.length > 0) {
      json.required = validKeyValues.map(String);
    }
  }
};
var nullableProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const inner = process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  if (ctx.target === "openapi-3.0") {
    seen.ref = def.innerType;
    json.nullable = true;
  } else {
    json.anyOf = [inner, { type: "null" }];
  }
};
var nonoptionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var UNREPRESENTABLE_DEFAULT = Symbol();
function serializeDefaultValue(value, schema, ctx, json, params) {
  let unrepresentable = false;
  const serialized = JSON.stringify(value, (_, val) => {
    if (typeof val !== "bigint")
      return val;
    unrepresentable = true;
    return null;
  });
  if (!unrepresentable)
    return JSON.parse(serialized);
  handleUnrepresentable(schema, ctx, json, params, "BigInt defaults cannot be represented in JSON Schema");
  return UNREPRESENTABLE_DEFAULT;
}
var defaultProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
  if (value !== UNREPRESENTABLE_DEFAULT)
    json.default = value;
};
var prefaultProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  if (ctx.io !== "input")
    return;
  const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
  if (value !== UNREPRESENTABLE_DEFAULT)
    json._prefault = value;
};
var catchProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  let catchValue;
  try {
    catchValue = def.catchValue(undefined);
  } catch {
    handleUnrepresentable(schema, ctx, json, params, "Dynamic catch values are not supported in JSON Schema");
    return;
  }
  json.default = catchValue;
};
var pipeProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  const inIsTransform = def.in._zod.traits.has("$ZodTransform");
  const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
  process(innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = innerType;
};
var readonlyProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  json.readOnly = true;
};
var optionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var lazyProcessor = (schema, ctx, _json, params) => {
  const innerType = schema._zod.innerType;
  process(innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = innerType;
};
// node_modules/zod/v4/classic/errors.js
var _installedErrorProtos = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
function _lazyMethod(proto, key, make) {
  Object.defineProperty(proto, key, {
    configurable: true,
    enumerable: false,
    get() {
      const value = make(this);
      Object.defineProperty(this, key, { value, configurable: true, writable: true });
      return value;
    },
    set(value) {
      Object.defineProperty(this, key, { value, configurable: true, writable: true });
    }
  });
}
var initializer2 = (inst, issues) => {
  $ZodError.init(inst, issues);
  inst.name = "ZodError";
  const proto = Object.getPrototypeOf(inst);
  if (_installedErrorProtos.has(proto))
    return;
  _installedErrorProtos.add(proto);
  _lazyMethod(proto, "format", (self) => (mapper) => formatError(self, mapper));
  _lazyMethod(proto, "flatten", (self) => (mapper) => flattenError(self, mapper));
  _lazyMethod(proto, "addIssue", (self) => (issue) => {
    self.issues.push(issue);
    self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
  });
  _lazyMethod(proto, "addIssues", (self) => (issues) => {
    self.issues.push(...issues);
    self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
  });
  Object.defineProperty(proto, "isEmpty", {
    configurable: true,
    enumerable: false,
    get() {
      return this.issues.length === 0;
    }
  });
};
var ZodRealError = /* @__PURE__ */ $constructor("ZodError", initializer2, undefined, {
  Parent: Error
});

// node_modules/zod/v4/classic/parse.js
var parse3 = /* @__PURE__ */ _parse(ZodRealError);
var parseAsync2 = /* @__PURE__ */ _parseAsync(ZodRealError);
var safeParse2 = /* @__PURE__ */ _safeParse(ZodRealError);
var safeParseAsync2 = /* @__PURE__ */ _safeParseAsync(ZodRealError);
var encode = /* @__PURE__ */ _encode(ZodRealError);
var decode = /* @__PURE__ */ _decode(ZodRealError);
var encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
var decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
var safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
var safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
var safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
var safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);

// node_modules/zod/v4/classic/schemas.js
function _ensureDefaultLocale() {
  if (!globalConfig.localeError)
    config(en_default());
}
function _ensureDefaultMemoizer() {
  if (!globalConfig.memoizer)
    config({ memoizer: memoizer() });
}
var ZodType = /* @__PURE__ */ $constructor("ZodType", (inst, def) => {
  _ensureDefaultLocale();
  $ZodType.init(inst, def);
  inst.def = def;
  inst.type = def.type;
  return inst;
}, {
  check(...chks) {
    const def = this.def;
    return this.clone(mergeDefs(def, {
      checks: [
        ...def.checks ?? [],
        ...chks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
      ]
    }), { parent: true });
  },
  with(...chks) {
    return this.check(...chks);
  },
  clone(def, params) {
    return clone(this, def, params);
  },
  brand() {
    return this;
  },
  register(reg, meta) {
    reg.add(this, meta);
    return this;
  },
  refine(check, params) {
    return this.check(refine(check, params));
  },
  superRefine(refinement, params) {
    return this.check(superRefine(refinement, params));
  },
  overwrite(fn) {
    return this.check(_overwrite(fn));
  },
  optional() {
    return optional(this);
  },
  exactOptional() {
    return exactOptional(this);
  },
  nullable() {
    return nullable(this);
  },
  nullish() {
    return optional(nullable(this));
  },
  nonoptional(params) {
    return nonoptional(this, params);
  },
  array() {
    return array(this);
  },
  or(arg) {
    return union([this, arg]);
  },
  and(arg) {
    return intersection(this, arg);
  },
  transform(tx) {
    return pipe(this, transform(tx));
  },
  default(d) {
    return _default(this, d);
  },
  prefault(d) {
    return prefault(this, d);
  },
  catch(params) {
    return _catch(this, params);
  },
  pipe(target) {
    return pipe(this, target);
  },
  readonly() {
    return readonly(this);
  },
  describe(description) {
    const cl = this.clone();
    globalRegistry.add(cl, { description });
    return cl;
  },
  meta(...args) {
    if (args.length === 0)
      return globalRegistry.get(this);
    const cl = this.clone();
    globalRegistry.add(cl, args[0]);
    return cl;
  },
  isOptional() {
    return this.safeParse(undefined).success;
  },
  isNullable() {
    return this.safeParse(null).success;
  },
  apply(fn, ...args) {
    return args.length === 0 ? fn(this) : fn(this, ...args);
  },
  get "~standard"() {
    return hide(this, "~standard", {
      ...standardProps(this),
      jsonSchema: {
        input: createStandardJSONSchemaMethod(this, "input"),
        output: createStandardJSONSchemaMethod(this, "output")
      }
    });
  },
  set "~standard"(value) {
    own(this, "~standard", value);
  },
  parse: function _parse(data, params) {
    return parse3(this, data, params, { callee: _parse });
  },
  parseAsync: async function _parseAsync(data, params) {
    return await parseAsync2(this, data, params, { callee: _parseAsync });
  },
  safeParse(data, params) {
    return safeParse2(this, data, params);
  },
  async safeParseAsync(data, params) {
    return safeParseAsync2(this, data, params);
  },
  get spa() {
    return this?.safeParseAsync;
  },
  set spa(value) {
    own(this, "spa", value);
  },
  encode: function _encode(data, params) {
    return encode(this, data, params, { callee: _encode });
  },
  decode: function _decode(data, params) {
    return decode(this, data, params, { callee: _decode });
  },
  encodeAsync: async function _encodeAsync(data, params) {
    return await encodeAsync(this, data, params, { callee: _encodeAsync });
  },
  decodeAsync: async function _decodeAsync(data, params) {
    return await decodeAsync(this, data, params, { callee: _decodeAsync });
  },
  safeEncode(data, params) {
    return safeEncode(this, data, params);
  },
  safeDecode(data, params) {
    return safeDecode(this, data, params);
  },
  async safeEncodeAsync(data, params) {
    return safeEncodeAsync(this, data, params);
  },
  async safeDecodeAsync(data, params) {
    return safeDecodeAsync(this, data, params);
  },
  toJSONSchema(params) {
    return createToJSONSchemaMethod(this, {})(params);
  },
  get description() {
    return globalRegistry.get(this)?.description;
  },
  get _def() {
    return this._zod.def;
  }
});
var _ZodString = /* @__PURE__ */ $constructor("_ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
  const bag = inst._zod.bag;
  inst.format = bag.format ?? null;
  inst.minLength = bag.minimum ?? null;
  inst.maxLength = bag.maximum ?? null;
}, {
  regex(...args) {
    return this.check(_regex(...args));
  },
  includes(...args) {
    return this.check(_includes(...args));
  },
  startsWith(...args) {
    return this.check(_startsWith(...args));
  },
  endsWith(...args) {
    return this.check(_endsWith(...args));
  },
  min(...args) {
    return this.check(_minLength(...args));
  },
  max(...args) {
    return this.check(_maxLength(...args));
  },
  length(...args) {
    return this.check(_length(...args));
  },
  nonempty(...args) {
    return this.check(_minLength(1, ...args));
  },
  lowercase(params) {
    return this.check(_lowercase(params));
  },
  uppercase(params) {
    return this.check(_uppercase(params));
  },
  trim() {
    return this.check(_trim());
  },
  normalize(...args) {
    return this.check(_normalize(...args));
  },
  toLowerCase() {
    return this.check(_toLowerCase());
  },
  toUpperCase() {
    return this.check(_toUpperCase());
  },
  slugify() {
    return this.check(_slugify());
  }
});
var ZodString = /* @__PURE__ */ $constructor("ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  _ZodString.init(inst, def);
}, {
  email(params) {
    return this.check(_email(ZodEmail, params));
  },
  url(params) {
    return this.check(_url(ZodURL, params));
  },
  jwt(params) {
    return this.check(_jwt(ZodJWT, params));
  },
  emoji(params) {
    return this.check(_emoji2(ZodEmoji, params));
  },
  guid(params) {
    return this.check(_guid(ZodGUID, params));
  },
  uuid(params) {
    return this.check(_uuid(ZodUUID, params));
  },
  uuidv4(params) {
    return this.check(_uuidv4(ZodUUID, params));
  },
  uuidv6(params) {
    return this.check(_uuidv6(ZodUUID, params));
  },
  uuidv7(params) {
    return this.check(_uuidv7(ZodUUID, params));
  },
  nanoid(params) {
    return this.check(_nanoid(ZodNanoID, params));
  },
  cuid(params) {
    return this.check(_cuid(ZodCUID, params));
  },
  cuid2(params) {
    return this.check(_cuid2(ZodCUID2, params));
  },
  ulid(params) {
    return this.check(_ulid(ZodULID, params));
  },
  base64(params) {
    return this.check(_base64(ZodBase64, params));
  },
  base64url(params) {
    return this.check(_base64url(ZodBase64URL, params));
  },
  xid(params) {
    return this.check(_xid(ZodXID, params));
  },
  ksuid(params) {
    return this.check(_ksuid(ZodKSUID, params));
  },
  ipv4(params) {
    return this.check(_ipv4(ZodIPv4, params));
  },
  ipv6(params) {
    return this.check(_ipv6(ZodIPv6, params));
  },
  cidrv4(params) {
    return this.check(_cidrv4(ZodCIDRv4, params));
  },
  cidrv6(params) {
    return this.check(_cidrv6(ZodCIDRv6, params));
  },
  e164(params) {
    return this.check(_e164(ZodE164, params));
  },
  datetime(params) {
    return this.check(_isoDateTime(ZodISODateTime, params));
  },
  date(params) {
    return this.check(_isoDate(ZodISODate, params));
  },
  time(params) {
    return this.check(_isoTime(ZodISOTime, params));
  },
  duration(params) {
    return this.check(_isoDuration(ZodISODuration, params));
  }
});
function string2(params) {
  return _string(ZodString, params);
}
var ZodStringFormat = /* @__PURE__ */ $constructor("ZodStringFormat", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  _ZodString.init(inst, def);
});
var ZodISODateTime = /* @__PURE__ */ $constructor("ZodISODateTime", (inst, def) => {
  $ZodISODateTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodISODate = /* @__PURE__ */ $constructor("ZodISODate", (inst, def) => {
  $ZodISODate.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodISOTime = /* @__PURE__ */ $constructor("ZodISOTime", (inst, def) => {
  $ZodISOTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodISODuration = /* @__PURE__ */ $constructor("ZodISODuration", (inst, def) => {
  $ZodISODuration.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodEmail = /* @__PURE__ */ $constructor("ZodEmail", (inst, def) => {
  $ZodEmail.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodGUID = /* @__PURE__ */ $constructor("ZodGUID", (inst, def) => {
  $ZodGUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodUUID = /* @__PURE__ */ $constructor("ZodUUID", (inst, def) => {
  $ZodUUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodURL = /* @__PURE__ */ $constructor("ZodURL", (inst, def) => {
  $ZodURL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodEmoji = /* @__PURE__ */ $constructor("ZodEmoji", (inst, def) => {
  $ZodEmoji.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodNanoID = /* @__PURE__ */ $constructor("ZodNanoID", (inst, def) => {
  $ZodNanoID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCUID = /* @__PURE__ */ $constructor("ZodCUID", (inst, def) => {
  $ZodCUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCUID2 = /* @__PURE__ */ $constructor("ZodCUID2", (inst, def) => {
  $ZodCUID2.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodULID = /* @__PURE__ */ $constructor("ZodULID", (inst, def) => {
  $ZodULID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodXID = /* @__PURE__ */ $constructor("ZodXID", (inst, def) => {
  $ZodXID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodKSUID = /* @__PURE__ */ $constructor("ZodKSUID", (inst, def) => {
  $ZodKSUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodIPv4 = /* @__PURE__ */ $constructor("ZodIPv4", (inst, def) => {
  $ZodIPv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodIPv6 = /* @__PURE__ */ $constructor("ZodIPv6", (inst, def) => {
  $ZodIPv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCIDRv4 = /* @__PURE__ */ $constructor("ZodCIDRv4", (inst, def) => {
  $ZodCIDRv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCIDRv6 = /* @__PURE__ */ $constructor("ZodCIDRv6", (inst, def) => {
  $ZodCIDRv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodBase64 = /* @__PURE__ */ $constructor("ZodBase64", (inst, def) => {
  $ZodBase64.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodBase64URL = /* @__PURE__ */ $constructor("ZodBase64URL", (inst, def) => {
  $ZodBase64URL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodE164 = /* @__PURE__ */ $constructor("ZodE164", (inst, def) => {
  $ZodE164.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodJWT = /* @__PURE__ */ $constructor("ZodJWT", (inst, def) => {
  $ZodJWT.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodNumber = /* @__PURE__ */ $constructor("ZodNumber", (inst, def) => {
  $ZodNumber.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
  const bag = inst._zod.bag;
  inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
  inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
  inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? 0.5);
  inst.isFinite = true;
  inst.format = bag.format ?? null;
}, {
  gt(value, params) {
    return this.check(_gt(value, params));
  },
  gte(value, params) {
    return this.check(_gte(value, params));
  },
  min(value, params) {
    return this.check(_gte(value, params));
  },
  lt(value, params) {
    return this.check(_lt(value, params));
  },
  lte(value, params) {
    return this.check(_lte(value, params));
  },
  max(value, params) {
    return this.check(_lte(value, params));
  },
  int(params) {
    return this.check(int(params));
  },
  safe(params) {
    return this.check(int(params));
  },
  positive(params) {
    return this.check(_gt(0, params));
  },
  nonnegative(params) {
    return this.check(_gte(0, params));
  },
  negative(params) {
    return this.check(_lt(0, params));
  },
  nonpositive(params) {
    return this.check(_lte(0, params));
  },
  multipleOf(value, params) {
    return this.check(_multipleOf(value, params));
  },
  step(value, params) {
    return this.check(_multipleOf(value, params));
  },
  finite() {
    return this;
  }
});
function number2(params) {
  return _number(ZodNumber, params);
}
var ZodNumberFormat = /* @__PURE__ */ $constructor("ZodNumberFormat", (inst, def) => {
  $ZodNumberFormat.init(inst, def);
  ZodNumber.init(inst, def);
});
function int(params) {
  return _int(ZodNumberFormat, params);
}
var ZodBoolean = /* @__PURE__ */ $constructor("ZodBoolean", (inst, def) => {
  $ZodBoolean.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
});
function boolean2(params) {
  return _boolean(ZodBoolean, params);
}
var ZodUnknown = /* @__PURE__ */ $constructor("ZodUnknown", (inst, def) => {
  $ZodUnknown.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => unknownProcessor(inst, ctx, json, params);
});
function unknown() {
  return _unknown(ZodUnknown);
}
var ZodNever = /* @__PURE__ */ $constructor("ZodNever", (inst, def) => {
  $ZodNever.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
});
function never(params) {
  return _never(ZodNever, params);
}
var ZodArray = /* @__PURE__ */ $constructor("ZodArray", (inst, def) => {
  _ensureDefaultMemoizer();
  $ZodArray.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
  inst.element = def.element;
}, {
  min(n, params) {
    return this.check(_minLength(n, params));
  },
  nonempty(params) {
    return this.check(_minLength(1, params));
  },
  max(n, params) {
    return this.check(_maxLength(n, params));
  },
  length(n, params) {
    return this.check(_length(n, params));
  },
  unwrap() {
    return this.element;
  }
});
function array(element, params) {
  return _array(ZodArray, element, params);
}
var ZodObject = /* @__PURE__ */ $constructor("ZodObject", (inst, def) => {
  _ensureDefaultMemoizer();
  $ZodObjectJIT.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
  installLazyProp(inst, "shape", (self) => self._zod.def.shape, false);
}, {
  keyof() {
    return _enum(Object.keys(this._zod.def.shape));
  },
  catchall(catchall) {
    return this.clone({ ...this._zod.def, catchall });
  },
  passthrough() {
    return this.clone({ ...this._zod.def, catchall: unknown() });
  },
  loose() {
    return this.clone({ ...this._zod.def, catchall: unknown() });
  },
  strict() {
    return this.clone({ ...this._zod.def, catchall: never() });
  },
  strip() {
    return this.clone({ ...this._zod.def, catchall: undefined });
  },
  extend(incoming) {
    return extend(this, incoming);
  },
  safeExtend(incoming) {
    return safeExtend(this, incoming);
  },
  merge(other) {
    return merge(this, other);
  },
  pick(mask) {
    return pick(this, mask);
  },
  omit(mask) {
    return omit(this, mask);
  },
  partial(...args) {
    return partial(ZodOptional, this, args[0]);
  },
  exactPartial(...args) {
    return partial(ZodExactOptional, this, args[0], "exactPartial");
  },
  required(...args) {
    return required(ZodNonOptional, this, args[0]);
  }
});
function object(shape, params) {
  const def = {
    type: "object",
    shape: shape ?? {},
    ...normalizeParams(params)
  };
  return new ZodObject(def);
}
var ZodUnion = /* @__PURE__ */ $constructor("ZodUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
  inst.options = def.options;
});
function union(options, params) {
  return new ZodUnion({
    type: "union",
    options,
    ...normalizeParams(params)
  });
}
var ZodIntersection = /* @__PURE__ */ $constructor("ZodIntersection", (inst, def) => {
  $ZodIntersection.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
});
function intersection(left, right) {
  return new ZodIntersection({
    type: "intersection",
    left,
    right
  });
}
var ZodTuple = /* @__PURE__ */ $constructor("ZodTuple", (inst, def) => {
  _ensureDefaultMemoizer();
  $ZodTuple.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => tupleProcessor(inst, ctx, json, params);
}, {
  rest(rest) {
    return this.clone({
      ...this._zod.def,
      rest
    });
  },
  partial() {
    const def = this._zod.def;
    if (def.checks?.length)
      throw new Error(".partial() cannot be used on tuple schemas containing refinements");
    return this.clone({
      ...def,
      items: def.items.map((item) => new ZodOptional({ type: "optional", innerType: item }))
    });
  }
});
function tuple(items, _paramsOrRest, _params) {
  const hasRest = _paramsOrRest instanceof $ZodType;
  const params = hasRest ? _params : _paramsOrRest;
  const rest = hasRest ? _paramsOrRest : null;
  return new ZodTuple({
    type: "tuple",
    items,
    rest,
    ...normalizeParams(params)
  });
}
var ZodRecord = /* @__PURE__ */ $constructor("ZodRecord", (inst, def) => {
  _ensureDefaultMemoizer();
  $ZodRecord.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
  inst.keyType = def.keyType;
  inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
  if (!valueType || !valueType._zod) {
    return new ZodRecord({
      type: "record",
      keyType: string2(),
      valueType: keyType,
      ...normalizeParams(valueType)
    });
  }
  return new ZodRecord({
    type: "record",
    keyType,
    valueType,
    ...normalizeParams(params)
  });
}
var ZodEnum = /* @__PURE__ */ $constructor("ZodEnum", (inst, def) => {
  $ZodEnum.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
  inst.enum = def.entries;
  inst.options = Object.values(def.entries);
  const keys = new Set(Object.keys(def.entries));
  inst.extract = (values, params) => {
    const newEntries = {};
    for (const value of values) {
      if (keys.has(value)) {
        newEntries[value] = def.entries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...normalizeParams(params),
      entries: newEntries
    });
  };
  inst.exclude = (values, params) => {
    const newEntries = { ...def.entries };
    for (const value of values) {
      if (keys.has(value)) {
        delete newEntries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...normalizeParams(params),
      entries: newEntries
    });
  };
});
function _enum(values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new ZodEnum({
    type: "enum",
    entries,
    ...normalizeParams(params)
  });
}
var ZodLiteral = /* @__PURE__ */ $constructor("ZodLiteral", (inst, def) => {
  $ZodLiteral.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
  inst.values = new Set(def.values);
  Object.defineProperty(inst, "value", {
    get() {
      if (def.values.length > 1) {
        throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
      }
      return def.values[0];
    }
  });
});
function literal(value, params) {
  return new ZodLiteral({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...normalizeParams(params)
  });
}
var ZodTransform = /* @__PURE__ */ $constructor("ZodTransform", (inst, def) => {
  _ensureDefaultMemoizer();
  $ZodTransform.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
  inst._zod.parse = (payload, _ctx) => {
    if (_ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(issue(issue2, payload.value, def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        if (!("input" in _issue))
          _issue.input = payload.value;
        _issue.inst ?? (_issue.inst = inst);
        payload.issues.push(issue(_issue));
      }
    };
    const output = def.transform(payload.value, payload);
    if (output instanceof Promise) {
      return output.then((output) => {
        payload.value = output;
        return payload;
      });
    }
    payload.value = output;
    return payload;
  };
});
function transform(fn) {
  return new ZodTransform({
    type: "transform",
    transform: fn
  });
}
var ZodOptional = /* @__PURE__ */ $constructor("ZodOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
  return new ZodOptional({
    type: "optional",
    innerType
  });
}
var ZodExactOptional = /* @__PURE__ */ $constructor("ZodExactOptional", (inst, def) => {
  $ZodExactOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
  return new ZodExactOptional({
    type: "optional",
    innerType
  });
}
var ZodNullable = /* @__PURE__ */ $constructor("ZodNullable", (inst, def) => {
  $ZodNullable.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
  return new ZodNullable({
    type: "nullable",
    innerType
  });
}
var ZodDefault = /* @__PURE__ */ $constructor("ZodDefault", (inst, def) => {
  $ZodDefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeDefault = inst.unwrap;
});
function _default(innerType, defaultValue) {
  return new ZodDefault({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
    }
  });
}
var ZodPrefault = /* @__PURE__ */ $constructor("ZodPrefault", (inst, def) => {
  $ZodPrefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
  return new ZodPrefault({
    type: "prefault",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
    }
  });
}
var ZodNonOptional = /* @__PURE__ */ $constructor("ZodNonOptional", (inst, def) => {
  $ZodNonOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
  return new ZodNonOptional({
    type: "nonoptional",
    innerType,
    ...normalizeParams(params)
  });
}
var ZodCatch = /* @__PURE__ */ $constructor("ZodCatch", (inst, def) => {
  $ZodCatch.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeCatch = inst.unwrap;
});
function _catch(innerType, catchValue) {
  return new ZodCatch({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : constantCatch(catchValue)
  });
}
var ZodPipe = /* @__PURE__ */ $constructor("ZodPipe", (inst, def) => {
  $ZodPipe.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
  inst.in = def.in;
  inst.out = def.out;
});
function pipe(in_, out) {
  return new ZodPipe({
    type: "pipe",
    in: in_,
    out
  });
}
var ZodReadonly = /* @__PURE__ */ $constructor("ZodReadonly", (inst, def) => {
  $ZodReadonly.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
  return new ZodReadonly({
    type: "readonly",
    innerType
  });
}
var ZodLazy = /* @__PURE__ */ $constructor("ZodLazy", (inst, def) => {
  $ZodLazy.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => lazyProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.getter();
});
function lazy(getter) {
  return new ZodLazy({
    type: "lazy",
    getter
  });
}
var ZodCustom = /* @__PURE__ */ $constructor("ZodCustom", (inst, def) => {
  $ZodCustom.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
});
function refine(fn, _params = {}) {
  return _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
  return _superRefine(fn, params);
}
// src/model/layout.ts
var Rect = object({ x: number2(), y: number2(), w: number2(), h: number2() });
var PreferredSize = object({ width: string2(), height: string2() });
var LayoutNode = lazy(() => object({
  id: string2().optional(),
  tag: string2(),
  attrs: record(string2(), string2()),
  styles: record(string2(), string2()),
  flattenedCustomElements: array(object({ tag: string2(), id: string2().optional() })).optional(),
  preferredSize: PreferredSize.optional(),
  bounds: Rect,
  text: string2().optional(),
  lines: array(object({ bounds: Rect, start: number2(), length: number2() })).optional(),
  paint: number2().optional(),
  children: array(LayoutNode)
}));
var FontFace = object({
  family: string2(),
  weight: tuple([number2(), number2()]),
  style: _enum(["normal", "italic", "oblique"]),
  unicodeRange: string2().optional(),
  src: array(object({ url: string2(), format: string2().optional(), file: string2().optional() })),
  loaded: boolean2()
});
var Combo = object({
  screen: string2(),
  theme: _enum(["light", "dark"]),
  demoState: string2().default("normal")
});
var LayoutDoc = object({
  version: literal(1),
  source: string2(),
  combo: Combo,
  size: object({ w: number2(), h: number2() }),
  dpr: number2(),
  canvas: string2().default("rgb(255, 255, 255)"),
  fonts: array(FontFace).optional(),
  root: LayoutNode
});
var STYLE_WHITELIST = [
  "align-content",
  "align-items",
  "align-self",
  "animation-duration",
  "animation-name",
  "aspect-ratio",
  "backdrop-filter",
  "background-blend-mode",
  "background-clip",
  "background-color",
  "background-image",
  "background-position",
  "background-repeat",
  "background-size",
  "border-bottom-color",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-bottom-style",
  "border-bottom-width",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-top-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-top-style",
  "border-top-width",
  "bottom",
  "box-shadow",
  "box-sizing",
  "clear",
  "clip-path",
  "color",
  "column-gap",
  "content",
  "direction",
  "display",
  "fill",
  "fill-opacity",
  "filter",
  "flex-basis",
  "flex-direction",
  "flex-grow",
  "flex-shrink",
  "flex-wrap",
  "float",
  "font-family",
  "font-size",
  "font-style",
  "font-variant-numeric",
  "font-weight",
  "grid-auto-flow",
  "grid-template-columns",
  "grid-template-rows",
  "height",
  "justify-content",
  "left",
  "letter-spacing",
  "line-height",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "mask-image",
  "mask-position",
  "mask-repeat",
  "mask-size",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "mix-blend-mode",
  "object-fit",
  "object-position",
  "opacity",
  "order",
  "outline-color",
  "outline-offset",
  "outline-style",
  "outline-width",
  "overflow-wrap",
  "overflow-x",
  "overflow-y",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "position",
  "right",
  "row-gap",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "stroke-width",
  "tab-size",
  "table-layout",
  "text-align",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-indent",
  "text-overflow",
  "text-shadow",
  "text-transform",
  "text-wrap-mode",
  "top",
  "transform",
  "transform-origin",
  "transition-duration",
  "transition-property",
  "vertical-align",
  "visibility",
  "-webkit-line-clamp",
  "-webkit-text-decorations-in-effect",
  "-webkit-text-fill-color",
  "white-space",
  "white-space-collapse",
  "width",
  "word-break",
  "writing-mode"
];

// src/browser/snapshot-geometry.ts
function assignLineBoxes(document2, raws) {
  const tb = document2.textBoxes;
  const nodeIndex = document2.layout.nodeIndex;
  for (let k = 0;k < tb.layoutIndex.length; k++) {
    const r = raws[nodeIndex[tb.layoutIndex[k]]];
    const b = tb.bounds[k];
    if (!r || !b)
      continue;
    (r.lines ??= []).push({ bounds: { x: b[0], y: b[1], w: b[2], h: b[3] }, start: tb.start[k], length: tb.length[k] });
  }
}
function pseudoBox(raw) {
  const o = raw.offset;
  if (!o)
    return;
  const position = raw.styles["position"] ?? "static";
  if (position === "fixed")
    return { ...o };
  for (let a = raw.parent;a; a = a.parent) {
    if (!a.bounds)
      continue;
    const positioned = (a.styles["position"] ?? "static") !== "static";
    if (a.name === "body")
      return positioned ? { x: a.bounds.x + o.x, y: a.bounds.y + o.y, w: o.w, h: o.h } : { ...o };
    if (positioned || position === "static" && (a.name === "table" || a.name === "td" || a.name === "th")) {
      const bl = parseFloat(a.styles["border-left-width"] ?? "") || 0;
      const bt = parseFloat(a.styles["border-top-width"] ?? "") || 0;
      return { x: a.bounds.x + bl + o.x, y: a.bounds.y + bt + o.y, w: o.w, h: o.h };
    }
  }
  return;
}
function rebase(b, o) {
  return { x: round(b.x - o.x), y: round(b.y - o.y), w: round(b.w), h: round(b.h) };
}
var round = (v) => Math.round(v * 100) / 100;

// src/browser/snapshot-columns.ts
function attachLayoutColumns(doc, raws, strings, boxes) {
  const L = doc.layout;
  for (let li = 0;li < L.nodeIndex.length; li++) {
    const r = raws[L.nodeIndex[li]];
    const b = L.bounds[li];
    r.bounds = { x: b[0], y: b[1], w: b[2], h: b[3] };
    const o = L.offsetRects?.[li];
    if (o)
      r.offset = { x: o[0], y: o[1], w: o[2], h: o[3] };
    const sv = L.styles[li] ?? [];
    for (let k = 0;k < STYLE_WHITELIST.length; k++) {
      const v = sv[k];
      if (v !== undefined && v >= 0)
        r.styles[STYLE_WHITELIST[k]] = strings[v];
    }
    const t = L.text[li];
    if (r.type === 3)
      r.text = r.value.trim() ? r.value : t !== undefined && t >= 0 ? strings[t] : "";
    else if (r.pseudo)
      r.text = t !== undefined && t >= 0 ? strings[t] : "";
    if (L.paintOrders)
      r.paint = L.paintOrders[li];
  }
  const LB = boxes?.documents[0]?.layout;
  if (LB) {
    for (let li = 0;li < LB.nodeIndex.length; li++) {
      const r = raws[LB.nodeIndex[li]];
      const b = LB.bounds[li];
      if (r && b)
        r.bounds = { x: b[0], y: b[1], w: b[2], h: b[3] };
      const o = LB.offsetRects?.[li];
      if (r && o)
        r.offset = { x: o[0], y: o[1], w: o[2], h: o[3] };
    }
  }
  assignLineBoxes(boxes?.documents[0] ?? doc, raws);
  const pseudo = doc.nodes.pseudoType;
  if (pseudo)
    for (const i of pseudo.index)
      raws[i].box = pseudoBox(raws[i]);
}

// src/browser/snapshot-assets.ts
var CURRENT_SRC_ATTR = "data-h2s-src";
function markCurrentSrc(img, currentSrc, base) {
  if (!currentSrc)
    return;
  const resolve = (u) => {
    try {
      return new URL(u, base).href;
    } catch {
      return u;
    }
  };
  const src = img.attrs["src"];
  if (src !== undefined && resolve(src) === currentSrc)
    return;
  const candidates = srcsetUrls(img.attrs["srcset"] ?? "");
  if (img.parent?.name === "picture") {
    for (const s of img.parent.children)
      if (s.type === 1 && s.name === "source")
        candidates.push(...srcsetUrls(s.attrs["srcset"] ?? ""));
  }
  img.attrs[CURRENT_SRC_ATTR] = candidates.find((c) => resolve(c) === currentSrc) ?? currentSrc;
}
function srcsetUrls(srcset) {
  const out = [];
  const n = srcset.length;
  let i = 0;
  while (i < n) {
    while (i < n && /[\s,]/.test(srcset[i]))
      i++;
    const start = i;
    while (i < n && !/\s/.test(srcset[i]))
      i++;
    const url = srcset.slice(start, i);
    if (!url)
      break;
    if (url.endsWith(","))
      out.push(url.replace(/,+$/, ""));
    else {
      out.push(url);
      while (i < n && srcset[i] !== ",")
        i++;
    }
  }
  return out;
}

// src/browser/snapshot-decode.ts
function snapshotToTree(snap, boxes) {
  const doc = snap.documents[0];
  if (!doc)
    throw new Error("empty snapshot");
  const S = snap.strings;
  const str = (i) => i >= 0 ? S[i] : "";
  const n = doc.nodes.nodeType.length;
  const raws = new Array(n);
  for (let i = 0;i < n; i++) {
    const attrs = {};
    const a = doc.nodes.attributes[i] ?? [];
    for (let k = 0;k + 1 < a.length; k += 2)
      attrs[str(a[k]).toLowerCase()] = str(a[k + 1]);
    raws[i] = {
      idx: i,
      type: doc.nodes.nodeType[i],
      name: str(doc.nodes.nodeName[i]).toLowerCase(),
      value: str(doc.nodes.nodeValue[i]),
      attrs,
      styles: {},
      children: []
    };
  }
  normalizeFormState(doc.nodes, raws, str);
  for (let i = 0;i < n; i++) {
    const p = doc.nodes.parentIndex[i];
    if (p >= 0) {
      raws[p].children.push(raws[i]);
      raws[i].parent = raws[p];
    }
  }
  const pseudo = doc.nodes.pseudoType;
  if (pseudo)
    for (let k = 0;k < pseudo.index.length; k++)
      raws[pseudo.index[k]].pseudo = str(pseudo.value[k]);
  attachLayoutColumns(doc, raws, S, boxes);
  const cur = doc.nodes.currentSourceURL;
  if (cur) {
    const base = str(doc.documentURL);
    for (let k = 0;k < cur.index.length; k++)
      markCurrentSrc(raws[cur.index[k]], str(cur.value[k]), base);
  }
  const html = raws.find((r) => r.type === 1 && r.name === "html");
  if (!html)
    throw new Error("no <html> in snapshot");
  return html;
}
function normalizeFormState(nodes, raws, str) {
  for (const [field, name] of [[nodes.inputValue, "input"], [nodes.textValue, "textarea"]]) {
    if (!field)
      continue;
    for (let k = 0;k < field.index.length; k++) {
      const raw = raws[field.index[k]];
      if (raw.name !== name)
        continue;
      const live = str(field.value[k]);
      const type = (raw.attrs.type ?? "text").toLowerCase();
      const defaultCaption = raw.name === "input" && (type === "submit" || type === "reset" || type === "button");
      if (!defaultCaption || live !== "" || raw.attrs.value !== undefined)
        raw.attrs.value = live;
    }
  }
  if (nodes.inputChecked) {
    for (const raw of raws)
      if (raw.name === "input")
        delete raw.attrs.checked;
    for (const i of nodes.inputChecked.index)
      if (raws[i]?.name === "input")
        raws[i].attrs.checked = "";
  }
  if (nodes.optionSelected) {
    for (const raw of raws)
      if (raw.name === "option")
        delete raw.attrs.selected;
    for (const i of nodes.optionSelected.index)
      if (raws[i]?.name === "option")
        raws[i].attrs.selected = "";
  }
}
// src/browser/generated-content.ts
function singleGeneratedImageUrl(content) {
  const value = content.trim();
  const head = /^url\s*\(/i.exec(value);
  if (!head)
    return;
  let index = head[0].length;
  while (/\s/.test(value[index] ?? ""))
    index++;
  const quote = value[index] === '"' || value[index] === "'" ? value[index++] : undefined;
  let source = "";
  let closed = false;
  while (index < value.length) {
    const char = value[index++];
    if (char === "\\") {
      const hex = /^[0-9a-f]{1,6}/i.exec(value.slice(index));
      if (hex) {
        source += String.fromCodePoint(parseInt(hex[0], 16));
        index += hex[0].length;
        if (/\s/.test(value[index] ?? ""))
          index++;
      } else if (index < value.length)
        source += value[index++];
      else
        return;
    } else if (char === quote) {
      closed = true;
      break;
    } else if (!quote && char === ")") {
      closed = true;
      break;
    } else if (!quote && (/\s/.test(char) || char === '"' || char === "'" || char === "("))
      return;
    else
      source += char;
  }
  if (!closed || !source)
    return;
  if (quote) {
    while (/\s/.test(value[index] ?? ""))
      index++;
    if (value[index++] !== ")")
      return;
  }
  return value.slice(index).trim() === "" ? source : undefined;
}
function generatedContentWarnings(root) {
  const warnings = [];
  const visit = (node) => {
    if (node.pseudo && hasImageFunction(node.styles.content ?? "") && !singleGeneratedImageUrl(node.styles.content ?? "") && (node.box?.w || node.bounds?.w || node.box?.h || node.bounds?.h)) {
      const host = node.parent;
      const source = host ? `<${host.name}>${host.attrs.id ? `#${host.attrs.id}` : ""}` : "element";
      warnings.push(`CSS ::${node.pseudo} generated image content on ${source} is not translated; only its measured box is kept`);
    }
    for (const child of node.children)
      visit(child);
  };
  visit(root);
  return warnings;
}
function hasImageFunction(content) {
  let quote;
  for (let i = 0;i < content.length; i++) {
    const char = content[i];
    if (quote) {
      if (char === "\\")
        i++;
      else if (char === quote)
        quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (i > 0 && /[\w-]/.test(content[i - 1]))
      continue;
    if (/^(?:url|(?:-webkit-)?image-set)\s*\(/i.test(content.slice(i)))
      return true;
  }
  return false;
}

// src/browser/snapshot-layout.ts
var SKIP_TAGS = { script: true, style: true, link: true, meta: true, template: true, noscript: true };
var KEEP_WITHOUT_LAYOUT = { defs: true, lineargradient: true, radialgradient: true, stop: true, clippath: true, mask: true, option: true, optgroup: true };
var PSEUDO_TAGS = { before: "::before", after: "::after", marker: "::marker" };
function attachPreferredSizes(root, sizes) {
  const walk = (raw, path) => {
    if (Object.hasOwn(sizes, path))
      raw.preferredSize = sizes[path];
    let i = 0;
    for (const child of raw.children) {
      if (child.type !== 1 || child.pseudo !== undefined)
        continue;
      const childPath = path ? `${path}/${i++}` : String(i++);
      walk(child, childPath);
    }
  };
  walk(root, "");
}
function findByAttr(root, attr, value) {
  if (root.attrs[attr] === value)
    return root;
  for (const c of root.children) {
    const f = findByAttr(c, attr, value);
    if (f)
      return f;
  }
  return;
}
function toLayout(raw, origin, identity, path = "") {
  if (raw.type !== 1 || SKIP_TAGS[raw.name])
    return;
  if (!raw.bounds && !KEEP_WITHOUT_LAYOUT[raw.name])
    return;
  return element(raw, origin, identity, path);
}
function element(raw, origin, identity, path) {
  const node = {
    tag: raw.name,
    attrs: raw.attrs,
    styles: raw.styles,
    bounds: raw.bounds ? rebase(raw.bounds, origin) : { x: 0, y: 0, w: 0, h: 0 },
    children: [],
    ...raw.preferredSize ? { preferredSize: raw.preferredSize } : {}
  };
  const id = identity(raw.name, raw.attrs, path);
  if (id !== undefined)
    node.id = id;
  if (raw.paint !== undefined)
    node.paint = raw.paint;
  appendChildren(raw, origin, identity, path, node.children, node);
  return node;
}
function appendChildren(raw, origin, identity, path, out, host) {
  let after;
  let i = 0;
  for (const c of raw.children) {
    if (c.type === 3) {
      if (c.bounds && c.text && (c.text.trim() || c.bounds.w > 0)) {
        const text = { tag: "#text", attrs: {}, styles: {}, bounds: rebase(c.bounds, origin), text: c.text, children: [] };
        if (c.lines && c.lines.length > 1)
          text.lines = c.lines.map((l) => ({ bounds: rebase(l.bounds, origin), start: l.start, length: l.length }));
        out.push(text);
      } else if (!raw.bounds && c.value.trim()) {
        out.push({ tag: "#text", attrs: {}, styles: {}, bounds: { x: 0, y: 0, w: 0, h: 0 }, text: c.value, children: [] });
      }
      continue;
    }
    if (c.type !== 1)
      continue;
    if (c.pseudo !== undefined) {
      const p = pseudoElement(c, origin, identity, path);
      if (!p)
        continue;
      if (c.pseudo === "after")
        after = p;
      else
        out.push(p);
      continue;
    }
    const childPath = path === "" ? `${i++}` : `${path}/${i++}`;
    if (SKIP_TAGS[c.name])
      continue;
    if (c.bounds || KEEP_WITHOUT_LAYOUT[c.name])
      out.push(element(c, origin, identity, childPath));
    else if (hasLayout(c)) {
      if (c.name.includes("-"))
        (host.flattenedCustomElements ??= []).push({ tag: c.name, ...c.attrs.id ? { id: c.attrs.id } : {} });
      appendChildren(c, origin, identity, childPath, out, host);
    }
  }
  if (after)
    out.push(after);
}
function hasLayout(raw) {
  return raw.bounds !== undefined || raw.children.some(hasLayout);
}
function pseudoElement(raw, origin, identity, parentPath) {
  const tag = PSEUDO_TAGS[raw.pseudo];
  if (!tag || !raw.bounds)
    return;
  const text = raw.text?.trim() ? raw.text : undefined;
  const box = raw.box && raw.box.w > 0 && raw.box.h > 0 ? raw.box : undefined;
  if (!text && !box)
    return;
  const imageUrl = box ? singleGeneratedImageUrl(raw.styles.content ?? "") : undefined;
  const bounds = rebase(box ?? raw.bounds, origin);
  const imageBounds = imageUrl && box ? rebase(pseudoContentBox(box, raw.styles), origin) : undefined;
  const node = {
    tag,
    attrs: {},
    styles: raw.styles,
    bounds,
    children: imageUrl && imageBounds ? [{ tag: "img", attrs: { src: imageUrl, alt: "" }, styles: { display: "block", "object-fit": "fill" }, bounds: imageBounds, children: [] }] : text ? [{ tag: "#text", attrs: {}, styles: {}, bounds: rebase(raw.bounds, origin), text, children: [] }] : []
  };
  const id = identity(tag, node.attrs, parentPath === "" ? tag : `${parentPath}/${tag}`);
  if (id !== undefined)
    node.id = id;
  if (raw.paint !== undefined)
    node.paint = raw.paint;
  return node;
}
function pseudoContentBox(box, styles) {
  const inset = (edge) => {
    const padding = parseFloat(styles[`padding-${edge}`] ?? "") || 0;
    const borderStyle = styles[`border-${edge}-style`];
    const border = borderStyle && borderStyle !== "none" && borderStyle !== "hidden" ? parseFloat(styles[`border-${edge}-width`] ?? "") || 0 : 0;
    return padding + border;
  };
  const top = inset("top"), right = inset("right"), bottom = inset("bottom"), left = inset("left");
  return { x: box.x + left, y: box.y + top, w: Math.max(0, box.w - left - right), h: Math.max(0, box.h - top - bottom) };
}
// src/browser/sizing.ts
async function readPreferredSizes(page, selector) {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root)
      throw new Error(`capture root ${selector} not found`);
    const out = {};
    const walk = (el, path) => {
      const typed = el;
      const map = typed.computedStyleMap?.();
      const width = map?.get("width")?.toString();
      const height = map?.get("height")?.toString();
      if (width !== undefined && height !== undefined)
        out[path] = { width, height };
      Array.from(el.children).forEach((child, i) => walk(child, path ? `${path}/${i}` : String(i)));
    };
    walk(root, "");
    return out;
  }, selector);
}

// src/browser/images.ts
function inlineCapturedImages(root, baseURL, images) {
  const warnings = new Set;
  const resolve = (source) => {
    if (!source || source.startsWith("data:") || source.startsWith("#"))
      return source;
    let url;
    try {
      url = new URL(source, baseURL).href;
    } catch {
      url = source;
    }
    const bytes = images.get(url);
    if (bytes)
      return bytes;
    warnings.add(`Image could not be embedded: ${url}; supply a data URL or a reachable image resource.`);
    return url;
  };
  const visit = (node) => {
    if (node.tag === "img") {
      const source = node.attrs["data-h2s-src"] ?? node.attrs.src;
      if (source)
        node.attrs["data-h2s-src"] = resolve(source);
    }
    if (node.tag === "video" && node.attrs.poster)
      node.attrs.poster = resolve(node.attrs.poster);
    for (const property of ["background-image", "mask-image", "-webkit-mask-image", "border-image-source", "list-style-image"]) {
      const value = node.styles[property];
      if (value)
        node.styles[property] = value.replace(/url\(\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^)]*))\s*\)/g, (match, double, single, bare) => {
          const source = (double ?? single ?? bare ?? "").trim();
          if (source.startsWith("data:") || source.startsWith("#"))
            return match;
          return `url(${JSON.stringify(resolve(source))})`;
        });
    }
    node.children.forEach(visit);
  };
  visit(root);
  return [...warnings];
}

// src/browser/motion.ts
async function readTransitionProperties(page, selector) {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root)
      throw new Error(`capture root ${selector} not found`);
    const out = {};
    const record = (element, path, pseudo) => {
      const style = getComputedStyle(element, pseudo);
      if (style.transitionProperty !== "none" && style.transitionDuration.split(",").some((time) => parseFloat(time) > 0)) {
        out[path] = style.transitionProperty;
      }
    };
    const walk = (element, path) => {
      record(element, path);
      for (const pseudo of ["::before", "::after", "::marker"])
        record(element, `${path}/${pseudo}`, pseudo);
      Array.from(element.children).forEach((child, i) => walk(child, path ? `${path}/${i}` : String(i)));
    };
    walk(root, "");
    return out;
  }, selector);
}
function restoreTransitionProperties(root, properties) {
  const walk = (raw, path) => {
    if (properties[path])
      raw.styles["transition-property"] = properties[path];
    let index = 0;
    for (const child of raw.children) {
      if (child.type !== 1)
        continue;
      if (child.pseudo)
        walk(child, `${path}/::${child.pseudo}`);
      else
        walk(child, path ? `${path}/${index++}` : String(index++));
    }
  };
  walk(root, "");
}
async function readKeyframeNames(page) {
  return page.evaluate(() => {
    const names = new Set;
    const visited = new Set;
    const visitSheet = (sheet) => {
      if (visited.has(sheet))
        return;
      visited.add(sheet);
      try {
        visitRules(sheet.cssRules);
      } catch {}
    };
    const visitRules = (rules) => {
      for (const rule of rules) {
        if (rule instanceof CSSKeyframesRule)
          names.add(rule.name);
        else if (rule instanceof CSSImportRule && rule.styleSheet)
          visitSheet(rule.styleSheet);
        else if ("cssRules" in rule)
          visitRules(rule.cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      if (sheet.ownerNode?.hasAttribute?.("data-h2s-harness"))
        continue;
      visitSheet(sheet);
    }
    return [...names];
  });
}

// src/browser/media.ts
async function readMediaConditions(page) {
  return page.evaluate(() => {
    const conditions = new Set;
    const visited = new Set;
    const add = (text) => {
      const condition = text.replace(/\s+/g, " ").trim();
      if (condition && condition !== "all")
        conditions.add(condition);
    };
    const visitSheet = (sheet) => {
      if (visited.has(sheet))
        return;
      visited.add(sheet);
      try {
        visitRules(sheet.cssRules);
      } catch {}
    };
    const visitRules = (rules) => {
      for (const rule of rules) {
        if (rule instanceof CSSMediaRule)
          add(rule.conditionText);
        if (rule instanceof CSSImportRule) {
          add(rule.media.mediaText);
          if (rule.styleSheet)
            visitSheet(rule.styleSheet);
        } else if ("cssRules" in rule)
          visitRules(rule.cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      if (sheet.ownerNode?.hasAttribute?.("data-h2s-harness"))
        continue;
      visitSheet(sheet);
    }
    return [...conditions];
  });
}
function mediaWarning(conditions) {
  if (!conditions.length)
    return;
  const shown = conditions.slice(0, 5).map((condition) => condition.length > 100 ? `${condition.slice(0, 97)}…` : condition);
  const remaining = conditions.length - shown.length;
  return `CSS @media conditions ${shown.join("; ")}${remaining ? `; +${remaining} more` : ""} were captured at one viewport/theme; the generated Swift view freezes this media-query state.`;
}

// src/browser/capture.ts
var ROOT_MARK = "data-h2s-root-capture";

class BrowserCapture {
  opts;
  browser;
  context;
  constructor(opts) {
    this.opts = opts;
  }
  async start() {
    this.browser = await chromium.launch({ headless: true, channel: this.opts.channel ?? "chrome" });
    this.context = await this.browser.newContext({
      viewport: this.opts.viewport,
      deviceScaleFactor: this.opts.dpr,
      reducedMotion: "reduce"
    });
  }
  async stop() {
    try {
      await this.context?.close();
    } finally {
      await this.browser?.close();
    }
  }
  async capture(spec, identity, source) {
    const page = await this.context.newPage();
    const errors = [];
    const styleWarnings = [];
    const images = new Map;
    const imageReads = [];
    const favicon = (url) => url.endsWith("/favicon.ico");
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error" && !favicon(m.location().url))
        errors.push(m.text());
    });
    page.on("requestfailed", (r) => errors.push(`request failed: ${r.url()}`));
    page.on("response", (r) => {
      if (r.status() >= 400 && !favicon(r.url()))
        errors.push(`${r.status()} ${r.url()}`);
      const mime = r.headers()["content-type"]?.split(";")[0];
      if (spec.inlineImages && r.ok() && mime?.startsWith("image/")) {
        imageReads.push(r.body().then((bytes) => {
          images.set(r.url(), `data:${mime};base64,${bytes.toString("base64")}`);
        }).catch(() => {
          errors.push(`Could not capture image bytes: ${r.url()}`);
        }));
      }
    });
    try {
      await page.emulateMedia({ colorScheme: spec.theme });
      if (this.opts.restricted)
        await page.route("**/*", (route) => route.abort());
      if (spec.html !== undefined) {
        const documentURL = new URL(spec.url);
        documentURL.hash = "";
        await page.route((url) => url.href === documentURL.href, (route) => route.request().isNavigationRequest() ? route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: spec.html,
          ...this.opts.restricted ? { headers: { "Content-Security-Policy": "default-src 'none'; script-src 'none'; connect-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-src 'none'" } } : {}
        }) : this.opts.restricted ? route.abort() : route.continue());
      }
      await page.goto(spec.url, { waitUntil: "load" });
      await page.waitForSelector(spec.waitFor ?? spec.root, { state: "attached", timeout: 15000 });
      await spec.prepare?.(page);
      const transitionProperties = await readTransitionProperties(page, spec.root);
      const noTransition = await page.addStyleTag({ content: "*, *::before, *::after, *::marker { transition-property: none !important; }" });
      await noTransition.evaluate((s) => s.setAttribute("data-h2s-harness", ""));
      await settle(page, spec.hide ?? []);
      for (const name of await readKeyframeNames(page))
        styleWarnings.push(`CSS @keyframes ${name} declaration is not translated; generated Swift captures only the static state`);
      const media = mediaWarning(await readMediaConditions(page));
      if (media)
        styleWarnings.push(media);
      const fonts = await collectFontFaces(page);
      const fontFiles = await readFontBytes(fonts, !this.opts.restricted);
      const rootRect = await page.evaluate(({ sel, mark }) => {
        const el = document.querySelector(sel);
        if (!el)
          throw new Error(`capture root ${sel} not found`);
        el.setAttribute(mark, "1");
        const r = el.getBoundingClientRect();
        let canvas = "rgb(255, 255, 255)";
        for (let p = el;p; p = p.parentElement) {
          const bg = getComputedStyle(p).backgroundColor;
          if (!bg || bg === "transparent" || bg === "none")
            continue;
          const legacy = /^rgba?\(([^)]+)\)$/.exec(bg);
          const slash = /\/\s*([\d.]+)(%?)\s*\)\s*$/.exec(bg);
          const alpha = legacy ? parseFloat((legacy[1].split(",")[3] ?? "1").trim()) : slash ? parseFloat(slash[1]) / (slash[2] ? 100 : 1) : 1;
          if (alpha > 0.5) {
            canvas = bg;
            break;
          }
        }
        return { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height, canvas };
      }, { sel: spec.root, mark: ROOT_MARK });
      const cdp = await this.context.newCDPSession(page);
      const preferredSizes = await readPreferredSizes(page, spec.root);
      const snapArgs = { computedStyles: [...STYLE_WHITELIST], includePaintOrder: true, includeDOMRects: true };
      const snapA = await cdp.send("DOMSnapshot.captureSnapshot", snapArgs);
      await page.evaluate(() => {
        const s = document.createElement("style");
        s.id = "__h2s_notransform";
        s.textContent = "* { transform: none !important; }";
        document.body.appendChild(s);
      });
      const snapB = await cdp.send("DOMSnapshot.captureSnapshot", snapArgs);
      await page.evaluate(() => document.getElementById("__h2s_notransform")?.remove());
      await cdp.detach();
      const tree = snapshotToTree(snapA, snapB);
      const rootRaw = findByAttr(tree, ROOT_MARK, "1");
      if (!rootRaw)
        throw new Error(`capture root ${spec.root} not in snapshot`);
      restoreTransitionProperties(rootRaw, transitionProperties);
      errors.push(...generatedContentWarnings(rootRaw));
      attachPreferredSizes(rootRaw, preferredSizes);
      delete rootRaw.attrs[ROOT_MARK];
      const root = toLayout(rootRaw, { x: rootRect.x, y: rootRect.y }, identity);
      if (!root)
        throw new Error(`capture root ${spec.root} has no layout`);
      const domHtml = await page.evaluate(({ sel, mark }) => {
        const el = document.querySelector(sel);
        el.removeAttribute(mark);
        return el.outerHTML;
      }, { sel: spec.root, mark: ROOT_MARK });
      const themeCss = await page.evaluate(() => [...document.querySelectorAll("style:not([data-h2s-harness])")].map((s) => s.textContent ?? "").join(`
`));
      const png = await page.screenshot({
        clip: { x: rootRect.x, y: rootRect.y, width: rootRect.w, height: rootRect.h },
        scale: "device",
        animations: "disabled",
        caret: "hide",
        type: "png"
      });
      if (spec.inlineImages) {
        await Promise.all(imageReads);
        errors.push(...inlineCapturedImages(root, await page.evaluate(() => document.baseURI), images));
      }
      if (errors.length && !spec.inlineImages)
        console.warn(`[render] ${spec.screen}/${spec.theme}: page errors:
  ${errors.join(`
  `)}`);
      return {
        warnings: [...errors, ...styleWarnings],
        layout: {
          version: 1,
          source,
          combo: { screen: spec.screen, theme: spec.theme, demoState: spec.demoState ?? "normal" },
          size: { w: Math.round(rootRect.w), h: Math.round(rootRect.h) },
          dpr: this.opts.dpr,
          canvas: rootRect.canvas,
          fonts,
          root
        },
        png,
        domHtml,
        themeCss,
        fontFiles
      };
    } finally {
      await page.close();
    }
  }
}

// src/input/source.ts
import { basename, dirname, resolve as resolve2 } from "node:path";
import { readFile } from "node:fs/promises";

// src/browser/server.ts
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf"
};
async function serveDir(rootDir) {
  const pages = new Map;
  const mounts = [];
  const root = resolve(rootDir);
  const server = createServer((request, response) => {
    (async () => {
      let path;
      try {
        path = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
      } catch {
        response.writeHead(400).end("bad request");
        return;
      }
      const page = /^\/__h2s\/page\/(.+)\.html$/.exec(path);
      if (page) {
        const html = pages.get(page[1]);
        if (html === undefined)
          response.writeHead(404).end("no such page");
        else
          response.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }).end(html);
        return;
      }
      const mount = mounts.find((item) => path.startsWith(item.prefix + "/"));
      const base = mount?.dir ?? root;
      const suffix = mount ? path.slice(mount.prefix.length) : path;
      const local = resolve(base, "." + suffix);
      const rel = relative(base, local);
      if (rel === ".." || rel.startsWith(".." + sep) || rel.startsWith(sep)) {
        response.writeHead(403).end("forbidden");
        return;
      }
      let entry;
      try {
        entry = await stat(local);
      } catch {
        response.writeHead(404).end("not found");
        return;
      }
      if (!entry.isFile()) {
        response.writeHead(404).end("not found");
        return;
      }
      response.writeHead(200, {
        "content-type": MIME[extname(local).toLowerCase()] ?? "application/octet-stream",
        "content-length": entry.size,
        "cache-control": "no-store"
      });
      createReadStream(local).on("error", () => response.destroy()).pipe(response);
    })().catch(() => {
      if (!response.headersSent)
        response.writeHead(500).end("server error");
      else
        response.destroy();
    });
  });
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", fail);
      done();
    });
  });
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    addPage(key, html) {
      pages.set(key, html);
      return `${origin}/__h2s/page/${key}.html`;
    },
    mount(prefix, dir) {
      mounts.push({ prefix, dir: resolve(dir) });
      return origin + prefix;
    },
    stop() {
      return new Promise((done, fail) => {
        server.close((error) => error ? fail(error) : done());
        server.closeAllConnections();
      });
    }
  };
}

// src/input/source.ts
async function resolveSource(source) {
  if ("url" in source) {
    const url = httpURL(source.url);
    return { url, label: url, close() {} };
  }
  if ("file" in source) {
    const file = resolve2(source.file);
    const html = await readFile(file, "utf8");
    const server = await serveDir(dirname(file));
    return { html, url: `${server.origin}/${encodeURIComponent(basename(file))}`, label: basename(file), close: () => server.stop() };
  }
  if (source.baseURL && source.assetsDir)
    throw new Error("choose baseURL or assetsDir, not both");
  const server = source.assetsDir ? await serveDir(resolve2(source.assetsDir)) : undefined;
  return {
    html: source.html,
    url: source.baseURL ? httpURL(source.baseURL) : `${server?.origin ?? "http://markswift.invalid"}/index.html`,
    label: "inline.html",
    close: () => server?.stop()
  };
}
function httpURL(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("only http and https page URLs are supported");
  return url.href;
}

// src/css/color.ts
var TRANSPARENT = { r: 0, g: 0, b: 0, a: 0 };
function parseColor(s) {
  if (!s)
    return;
  s = s.trim();
  if (s === "transparent")
    return TRANSPARENT;
  let m;
  if (m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)$/.exec(s)) {
    return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a: m[4] === undefined ? 1 : parseAlpha(m[4]) };
  }
  if (m = /^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(s)) {
    return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a: m[4] === undefined ? 1 : parseAlpha(m[4]) };
  }
  if (m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(s)) {
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : parseAlpha(m[4]) };
  }
  if (m = /^#([0-9a-f]{3,8})$/i.exec(s)) {
    const h = m[1];
    if (h.length === 5 || h.length === 7)
      return;
    const n = h.length <= 4 ? h.split("").map((c) => c + c).join("") : h;
    const v = (i) => parseInt(n.slice(i, i + 2), 16) / 255;
    return { r: v(0), g: v(2), b: v(4), a: n.length === 8 ? v(6) : 1 };
  }
  if (m = /^([a-z]+)\((.*)\)$/is.exec(s))
    return parseColorFunction(m[1].toLowerCase(), m[2].trim());
  return;
}
function parseAlpha(s) {
  return s.endsWith("%") ? parseFloat(s) / 100 : parseFloat(s);
}
var SRGB_TO_XYZ = [
  [0.41239079926595934, 0.357584339383878, 0.1804807884018343],
  [0.21263900587151027, 0.715168678767756, 0.07219231536073371],
  [0.01933081871559182, 0.11919477979462598, 0.9505321522496607]
];
var XYZ_TO_SRGB = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786]
];
var P3_TO_XYZ = [
  [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
  [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
  [0, 0.04511338185890264, 1.043944368900976]
];
var A98_TO_XYZ = [
  [0.5766690429101305, 0.1855582379065463, 0.1882286462349947],
  [0.29734497525053605, 0.6273635662554661, 0.07529145849399788],
  [0.02703136138641234, 0.07068885253582723, 0.9913375368376388]
];
var PROPHOTO_TO_XYZ_D50 = [
  [0.7977604896723027, 0.13518583717574031, 0.0313493495815248],
  [0.2880711282292934, 0.7118432178101014, 0.00008565396060525902],
  [0, 0, 0.8251046025104602]
];
var REC2020_TO_XYZ = [
  [0.6369580483012914, 0.14461690358620832, 0.1688809751641721],
  [0.2627002120112671, 0.6779980715188708, 0.05930171646986196],
  [0, 0.028072693049087428, 1.060985057710791]
];
var D50_TO_D65 = [
  [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
  [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
  [0.012314001688319899, -0.020507696433477912, 1.3303659366080753]
];
var IDENTITY = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1]
];
var OKLAB_TO_LMS = [
  [1, 0.3963377773761749, 0.2158037573099136],
  [1, -0.1055613458156586, -0.0638541728258133],
  [1, -0.0894841775298119, -1.2914855480194092]
];
var LMS_TO_XYZ = [
  [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
  [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
  [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816]
];
var D50_WHITE = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];
function mul(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  ];
}
function srgbToLinear(c) {
  const a = Math.abs(c);
  return a <= 0.04045 ? c / 12.92 : Math.sign(c) * ((a + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(c) {
  const a = Math.abs(c);
  return a > 0.0031308 ? Math.sign(c) * (1.055 * a ** (1 / 2.4) - 0.055) : 12.92 * c;
}
var COLOR_SPACES = {
  srgb: { lin: srgbToLinear, m: SRGB_TO_XYZ },
  "srgb-linear": { lin: (c) => c, m: SRGB_TO_XYZ },
  "display-p3": { lin: srgbToLinear, m: P3_TO_XYZ },
  "a98-rgb": { lin: (c) => Math.sign(c) * Math.abs(c) ** (563 / 256), m: A98_TO_XYZ },
  "prophoto-rgb": { lin: (c) => Math.abs(c) <= 16 / 512 ? c / 16 : Math.sign(c) * Math.abs(c) ** 1.8, m: PROPHOTO_TO_XYZ_D50, d50: true },
  rec2020: {
    lin: (c) => {
      const α = 1.09929682680944, β = 0.018053968510807, a = Math.abs(c);
      return a < β * 4.5 ? c / 4.5 : Math.sign(c) * ((a + α - 1) / α) ** (1 / 0.45);
    },
    m: REC2020_TO_XYZ
  },
  xyz: { lin: (c) => c, m: IDENTITY },
  "xyz-d65": { lin: (c) => c, m: IDENTITY },
  "xyz-d50": { lin: (c) => c, m: IDENTITY, d50: true }
};
var NUM = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i;
function component(t, pct, unit = 1) {
  if (t === "none")
    return 0;
  const m = NUM.exec(t);
  if (!m)
    return;
  const rest = t.slice(m[0].length);
  if (rest === "%")
    return +m[0] / 100 * pct;
  return rest === "" ? +m[0] * unit : undefined;
}
function hue(t) {
  if (t === "none")
    return 0;
  const m = NUM.exec(t);
  if (!m)
    return;
  const v = +m[0];
  switch (t.slice(m[0].length).toLowerCase()) {
    case "":
    case "deg":
      return v;
    case "rad":
      return v * 180 / Math.PI;
    case "grad":
      return v * 0.9;
    case "turn":
      return v * 360;
    default:
      return;
  }
}
function parseColorFunction(name, body) {
  let tokens;
  let alphaTok;
  if (body.includes(",")) {
    if (name !== "hsl" && name !== "hsla")
      return;
    tokens = body.split(",").map((t) => t.trim());
    if (tokens.length === 4)
      alphaTok = tokens.pop();
  } else {
    const slash = body.indexOf("/");
    const main = slash < 0 ? body : body.slice(0, slash);
    if (slash >= 0)
      alphaTok = body.slice(slash + 1).trim();
    tokens = main.trim().split(/\s+/);
  }
  let alpha = 1;
  if (alphaTok !== undefined) {
    const a = component(alphaTok, 1);
    if (a === undefined || alphaTok === "")
      return;
    alpha = Math.min(1, Math.max(0, a));
  }
  const space = name === "color" ? tokens.shift()?.toLowerCase() : undefined;
  if (tokens.length !== 3)
    return;
  const [t0, t1, t2] = tokens;
  switch (name) {
    case "hsl":
    case "hsla": {
      const h = hue(t0), sat = component(t1, 100), l = component(t2, 100);
      if (h === undefined || sat === undefined || l === undefined)
        return;
      return fromRgb(hslToRgb(h, Math.max(0, sat) / 100, Math.min(1, Math.max(0, l / 100))), alpha);
    }
    case "hwb": {
      const h = hue(t0), w = component(t1, 100), b = component(t2, 100);
      if (h === undefined || w === undefined || b === undefined)
        return;
      return fromRgb(hwbToRgb(h, Math.min(1, Math.max(0, w / 100)), Math.min(1, Math.max(0, b / 100))), alpha);
    }
    case "lab":
    case "lch": {
      const L = component(t0, 100);
      const c1 = name === "lab" ? component(t1, 125) : component(t1, 150);
      const c2 = name === "lab" ? component(t2, 125) : hue(t2);
      if (L === undefined || c1 === undefined || c2 === undefined)
        return;
      const [a, b] = name === "lab" ? [c1, c2] : polar(Math.max(0, c1), c2);
      return fromXyz(mul(D50_TO_D65, labToXyzD50(Math.max(0, L), a, b)), alpha);
    }
    case "oklab":
    case "oklch": {
      const L = component(t0, 1);
      const c1 = component(t1, 0.4);
      const c2 = name === "oklab" ? component(t2, 0.4) : hue(t2);
      if (L === undefined || c1 === undefined || c2 === undefined)
        return;
      const [a, b] = name === "oklab" ? [c1, c2] : polar(Math.max(0, c1), c2);
      return fromXyz(oklabToXyz(Math.max(0, L), a, b), alpha);
    }
    case "color": {
      const sp = space === undefined ? undefined : COLOR_SPACES[space];
      if (!sp)
        return;
      const c0 = component(t0, 1), c1 = component(t1, 1), c2 = component(t2, 1);
      if (c0 === undefined || c1 === undefined || c2 === undefined)
        return;
      const xyz = mul(sp.m, [sp.lin(c0), sp.lin(c1), sp.lin(c2)]);
      return fromXyz(sp.d50 ? mul(D50_TO_D65, xyz) : xyz, alpha);
    }
    default:
      return;
  }
}
function polar(chroma, hueDeg) {
  const h = hueDeg * Math.PI / 180;
  return [chroma * Math.cos(h), chroma * Math.sin(h)];
}
function hslToRgb(h, s, l) {
  h = (h % 360 + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
function hwbToRgb(h, w, b) {
  if (w + b >= 1) {
    const gray = w / (w + b);
    return [gray, gray, gray];
  }
  return hslToRgb(h, 1, 0.5).map((c) => c * (1 - w - b) + w);
}
function labToXyzD50(L, a, b) {
  const κ = 24389 / 27, ε = 216 / 24389;
  const fy = (L + 16) / 116, fx = a / 500 + fy, fz = fy - b / 200;
  const x = fx ** 3 > ε ? fx ** 3 : (116 * fx - 16) / κ;
  const y = L > κ * ε ? fy ** 3 : L / κ;
  const z = fz ** 3 > ε ? fz ** 3 : (116 * fz - 16) / κ;
  return [x * D50_WHITE[0], y * D50_WHITE[1], z * D50_WHITE[2]];
}
function oklabToXyz(L, a, b) {
  const lms = mul(OKLAB_TO_LMS, [L, a, b]).map((c) => c ** 3);
  return mul(LMS_TO_XYZ, lms);
}
function fromXyz(xyz, a) {
  return fromRgb(mul(XYZ_TO_SRGB, xyz).map(linearToSrgb), a);
}
function fromRgb([r, g, b], a) {
  const clip = (c) => Math.round(Math.min(1, Math.max(0, c)) * 1e4) / 1e4;
  return { r: clip(r), g: clip(g), b: clip(b), a };
}
// src/css/syntax.ts
function px(s) {
  if (!s)
    return 0;
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : 0;
}
function parseDeclared(style) {
  const out = {};
  if (!style)
    return out;
  for (const decl of splitTop(style, ";")) {
    const i = decl.indexOf(":");
    if (i < 0)
      continue;
    const k = decl.slice(0, i).trim().toLowerCase();
    if (k)
      out[k] = decl.slice(i + 1).trim();
  }
  return out;
}
function splitTop(s, sep) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(")
      depth++;
    else if (ch === ")")
      depth--;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else
      cur += ch;
  }
  if (cur.trim())
    out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
function resolveLength(t, ref) {
  t = t.trim();
  const calc = /^calc\((.*)\)$/s.exec(t);
  const terms = calc ? calc[1].replace(/\s*([-+])\s+/g, " $1").trim().split(/\s+/) : [t];
  let sum = 0;
  for (const term of terms) {
    const m = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(px|%)?$/i.exec(term.replace(/^\+/, ""));
    if (!m)
      return;
    if (m[2] === "%")
      sum += +m[1] / 100 * ref;
    else if (m[2] === "px" || +m[1] === 0)
      sum += +m[1];
    else
      return;
  }
  return sum;
}
function round2(v) {
  return Math.round(v * 100) / 100;
}
// src/css/blend.ts
var BLEND_MODES = {
  normal: true,
  multiply: true,
  screen: true,
  overlay: true,
  darken: true,
  lighten: true,
  "color-dodge": true,
  "color-burn": true,
  "hard-light": true,
  "soft-light": true,
  difference: true,
  exclusion: true,
  hue: true,
  saturation: true,
  color: true,
  luminosity: true,
  "plus-lighter": true,
  "plus-darker": true
};
function parseBlendMode(s) {
  const t = s?.trim().toLowerCase();
  return t && t in BLEND_MODES ? t : undefined;
}
function parseBlendModes(s) {
  if (!s)
    return [];
  return splitTop(s, ",").map((t) => parseBlendMode(t) ?? "normal");
}
// src/css/paint.ts
function paintWithin(p, host, sub) {
  if (p.kind === "radial" || p.kind === "conic") {
    const center = [
      sub.w ? (host.x + p.center[0] * host.w - sub.x) / sub.w : 0.5,
      sub.h ? (host.y + p.center[1] * host.h - sub.y) / sub.h : 0.5
    ];
    return { ...p, center: center.map((v) => Math.round(v * 1e4) / 1e4) };
  }
  if (p.kind !== "linear" || p.stops.length < 2)
    return p;
  const rad = p.angle * Math.PI / 180;
  const dx = Math.sin(rad), dy = -Math.cos(rad);
  const length = Math.abs(host.w * dx) + Math.abs(host.h * dy);
  if (length === 0)
    return p;
  const start = (host.x + host.w / 2) * dx + (host.y + host.h / 2) * dy - length / 2;
  const subHalf = (Math.abs(sub.w * dx) + Math.abs(sub.h * dy)) / 2;
  const subMid = (sub.x + sub.w / 2) * dx + (sub.y + sub.h / 2) * dy - start;
  const t0 = (subMid - subHalf) / length, t1 = (subMid + subHalf) / length;
  if (t1 <= t0)
    return p;
  const stops = p.stops.map((s) => ({ color: s.color, pos: ((s.pos ?? 0) - t0) / (t1 - t0) }));
  const at = (t) => {
    if (t <= stops[0].pos)
      return stops[0].color;
    for (let i = 1;i < stops.length; i++) {
      const a = stops[i - 1], b = stops[i];
      if (t <= b.pos) {
        const k = b.pos === a.pos ? 1 : (t - a.pos) / (b.pos - a.pos);
        const mix = (u, v) => Math.round((u + (v - u) * k) * 1e4) / 1e4;
        return { r: mix(a.color.r, b.color.r), g: mix(a.color.g, b.color.g), b: mix(a.color.b, b.color.b), a: mix(a.color.a, b.color.a) };
      }
    }
    return stops[stops.length - 1].color;
  };
  const cut = [{ color: at(0), pos: 0 }, ...stops.filter((s) => s.pos > 0 && s.pos < 1).map((s) => ({ color: s.color, pos: Math.round(s.pos * 1e4) / 1e4 })), { color: at(1), pos: 1 }];
  return { ...p, stops: cut };
}
function parseBackgroundImage(s) {
  if (!s || s === "none")
    return [];
  const layers = splitTop(s, ",").reverse();
  return layers.map(parseGradient);
}
function parseGradient(s) {
  s = s.trim();
  const u = /^url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)]*))\s*\)$/s.exec(s);
  if (u)
    return { kind: "image", url: (u[1] ?? u[2] ?? u[3] ?? "").replace(/\\(.)/g, "$1").trim() };
  const m = /^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/s.exec(s);
  if (!m)
    return { kind: "unsupported", raw: s };
  const kind = m[2];
  const args = splitTop(m[3], ",");
  let paint;
  if (kind === "linear") {
    let angle = 180;
    if (args[0] && !looksLikeColor(args[0])) {
      const a = args.shift();
      const deg = /^[-+]?[\d.]/.test(a) ? hue(a) : undefined;
      if (deg !== undefined)
        angle = deg;
      else if (/^to\s+/.test(a))
        angle = sideAngle(a);
      else
        return { kind: "unsupported", raw: s };
    }
    paint = { kind: "linear", angle, stops: parseStops(args) };
  } else if (kind === "radial") {
    let ellipse = true;
    let center = [0.5, 0.5];
    if (args[0] && !looksLikeColor(args[0])) {
      const a = args.shift();
      if (/\bcircle\b/.test(a))
        ellipse = false;
      center = atPosition(a) ?? center;
    }
    paint = { kind: "radial", stops: parseStops(args), center, ellipse };
  } else {
    let from = 0;
    let center = [0.5, 0.5];
    if (args[0] && !looksLikeColor(args[0])) {
      const a = args.shift();
      const f = /from\s+([-+\d.]+(?:deg|rad|grad|turn)?)/.exec(a);
      if (f)
        from = hue(f[1]) ?? 0;
      center = atPosition(a) ?? center;
    }
    paint = { kind: "conic", stops: parseStops(args), from, center };
  }
  if (m[1])
    paint.repeating = true;
  return paint;
}
function atPosition(prelude) {
  const at = /\bat\s+(\S+)(?:\s+(\S+))?\s*$/.exec(prelude);
  if (!at)
    return;
  const x = fraction(at[1]), y = at[2] === undefined ? 0.5 : fraction(at[2]);
  return x === undefined || y === undefined ? undefined : [x, y];
}
function fraction(t) {
  switch (t) {
    case "left":
    case "top":
      return 0;
    case "center":
      return 0.5;
    case "right":
    case "bottom":
      return 1;
  }
  const m = /^([-+\d.]+)%$/.exec(t);
  return m ? +m[1] / 100 : undefined;
}
var COLOR_TOKEN = String.raw`(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[0-9a-f]+|transparent`;
function looksLikeColor(s) {
  return /^(rgba?\(|hsla?\(|hwb\(|lab\(|lch\(|oklab\(|oklch\(|color\(|#|transparent$)/.test(s.trim());
}
function sideAngle(a) {
  const t = a.replace(/^to\s+/, "").trim();
  const map = { top: 0, right: 90, bottom: 180, left: 270, "top right": 45, "right top": 45, "bottom right": 135, "right bottom": 135, "bottom left": 225, "left bottom": 225, "top left": 315, "left top": 315 };
  return map[t] ?? 180;
}
function parseStops(args) {
  const stops = [];
  for (const a of args) {
    const m = new RegExp(String.raw`^(${COLOR_TOKEN})\s*(?:([-+\d.]+)(%|px|deg))?\s*$`, "i").exec(a);
    if (!m)
      continue;
    const color = parseColor(m[1]) ?? TRANSPARENT;
    const stop = { color };
    if (m[2] !== undefined && m[3] === "%")
      stop.pos = +m[2] / 100;
    else if (m[2] !== undefined && m[3] === "deg")
      stop.pos = +m[2] / 360;
    else if (m[2] !== undefined && m[3] === "px")
      stop.px = +m[2];
    stops.push(stop);
  }
  if (!stops.some((s) => s.px !== undefined))
    fillEvenly(stops);
  return stops;
}
function fillEvenly(stops) {
  if (!stops.length)
    return;
  if (stops[0].pos === undefined)
    stops[0].pos = 0;
  if (stops[stops.length - 1].pos === undefined)
    stops[stops.length - 1].pos = 1;
  let i = 0;
  while (i < stops.length) {
    if (stops[i].pos !== undefined) {
      i++;
      continue;
    }
    let j = i;
    while (stops[j].pos === undefined)
      j++;
    const p0 = stops[i - 1].pos;
    const p1 = stops[j].pos;
    for (let k = i;k < j; k++)
      stops[k].pos = p0 + (p1 - p0) * (k - i + 1) / (j - i + 1);
    i = j;
  }
}
function resolvePaint(p, w, h) {
  if (p.kind !== "linear" && p.kind !== "radial")
    return p;
  if (!p.stops.some((s) => s.px !== undefined))
    return p;
  let length;
  if (p.kind === "linear") {
    const rad = p.angle * Math.PI / 180;
    length = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
  } else {
    const cx = p.center[0] * w, cy = p.center[1] * h;
    length = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
  }
  const stops = p.stops.map(({ color, pos, px }) => {
    const stop = { color };
    if (px !== undefined && length > 0)
      pos = px / length;
    if (pos !== undefined)
      stop.pos = Math.round((p.repeating ? pos : Math.min(1, Math.max(0, pos))) * 1e4) / 1e4;
    return stop;
  });
  fillEvenly(stops);
  return { ...p, stops };
}
// src/css/shadows.ts
function parseShadows(s) {
  if (!s || s === "none")
    return [];
  const out = [];
  for (const part of splitTop(s, ",")) {
    const inset = /\binset\b/.test(part);
    const body = part.replace(/\binset\b/, "").trim();
    const m = new RegExp(String.raw`^(${COLOR_TOKEN})\s+([-\d.]+)px\s+([-\d.]+)px(?:\s+([-\d.]+)px)?(?:\s+([-\d.]+)px)?`, "i").exec(body);
    if (!m)
      continue;
    out.push({ color: parseColor(m[1]) ?? TRANSPARENT, x: +m[2], y: +m[3], blur: +(m[4] ?? 0), spread: +(m[5] ?? 0), inset });
  }
  return out;
}
// src/css/transforms.ts
function parseTransform(s) {
  if (!s || s === "none")
    return;
  const m = /^(matrix|matrix3d)\(([^)]+)\)$/.exec(s.trim());
  if (!m)
    return;
  const v = m[2].split(",").map((x) => parseFloat(x));
  let a, b, c, d, tx, ty;
  let flattened = false;
  if (m[1] === "matrix") {
    if (v.length !== 6)
      return;
    [a, b, c, d, tx, ty] = v;
  } else {
    if (v.length !== 16)
      return;
    const zeros = [2, 3, 6, 7, 8, 9, 11, 14];
    flattened = zeros.some((i) => v[i] !== 0) || v[10] !== 1 || v[15] !== 1;
    [a, b, c, d, tx, ty] = [v[0], v[1], v[4], v[5], v[12], v[13]];
  }
  const t = decompose(a, b, c, d, tx, ty);
  if (flattened)
    t.flattened = true;
  return t;
}
function decompose(a, b, c, d, tx, ty) {
  const out = { rotate: 0, scaleX: 1, scaleY: 1, tx: round2(tx), ty: round2(ty) };
  if (a === 1 && c === 0 && d === 1 && b !== 0) {
    out.skewY = round2(Math.atan(b) * 180 / Math.PI);
    return out;
  }
  const scaleX = Math.hypot(a, b);
  const shear = (a * c + b * d) / scaleX;
  const sheared = round2(Math.atan(shear / Math.hypot(c, d)) * 180 / Math.PI) !== 0;
  const scaleY = sheared ? Math.hypot(c - a / scaleX * shear, d - b / scaleX * shear) : Math.hypot(c, d);
  out.rotate = round2(Math.atan2(b, a) * 180 / Math.PI);
  out.scaleX = round2(scaleX);
  out.scaleY = round2(scaleY);
  if (sheared)
    out.skewX = round2(Math.atan(shear / scaleY) * 180 / Math.PI);
  return out;
}
function parseOrigin(s) {
  if (!s)
    return;
  const m = /^([-\d.]+)px\s+([-\d.]+)px/.exec(s);
  return m ? [+m[1], +m[2]] : undefined;
}
// src/css/effects.ts
function parseFilters(s) {
  const filters = [];
  const unsupported = [];
  if (!s || s === "none")
    return { filters, unsupported };
  for (const fn of s.match(/[a-z-]+\((?:[^()]|\([^()]*\))*\)/gi) ?? []) {
    const m = /^([a-z-]+)\((.*)\)$/is.exec(fn);
    const name = m[1].toLowerCase(), arg = m[2].trim();
    switch (name) {
      case "blur":
        filters.push({ kind: "blur", radius: px(arg) });
        break;
      case "hue-rotate":
        filters.push({ kind: "hue-rotate", degrees: hue(arg) ?? 0 });
        break;
      case "drop-shadow": {
        const shadow = parseShadows(arg)[0];
        if (shadow)
          filters.push({ kind: "drop-shadow", shadow });
        else
          unsupported.push(fn);
        break;
      }
      case "grayscale":
      case "brightness":
      case "contrast":
      case "saturate":
      case "invert":
      case "sepia":
      case "opacity":
        filters.push({ kind: name, amount: arg.endsWith("%") ? parseFloat(arg) / 100 : parseFloat(arg) });
        break;
      default:
        unsupported.push(fn);
    }
  }
  return { filters, unsupported };
}
function parseClipPath(s, w, h) {
  if (!s || s === "none")
    return;
  const m = /^(circle|ellipse|inset|polygon)\((.*)\)\s*$/s.exec(s.trim());
  if (!m)
    return;
  const body = m[2].trim();
  if (m[1] === "polygon") {
    const points = [];
    for (const pair of splitTop(body, ",")) {
      const [x, y] = splitTop(pair, " ");
      if (x === "nonzero" || x === "evenodd")
        continue;
      const px_ = resolveLength(x ?? "", w), py_ = resolveLength(y ?? "", h);
      if (px_ === undefined || py_ === undefined)
        return;
      points.push([round2(px_), round2(py_)]);
    }
    return points.length >= 3 ? { kind: "polygon", points } : undefined;
  }
  if (m[1] === "inset") {
    const [insets, round] = body.split(/\s+round\s+/);
    const t = splitTop(insets ?? "", " ");
    const v = [t[0] ?? "0", t[1] ?? t[0] ?? "0", t[2] ?? t[0] ?? "0", t[3] ?? t[1] ?? t[0] ?? "0"];
    const top = resolveLength(v[0], h), right = resolveLength(v[1], w), bottom = resolveLength(v[2], h), left = resolveLength(v[3], w);
    if (top === undefined || right === undefined || bottom === undefined || left === undefined)
      return;
    const shape = { kind: "inset", top: round2(top), right: round2(right), bottom: round2(bottom), left: round2(left) };
    const radius = round ? resolveLength(splitTop(round, " ")[0] ?? "", Math.min(w, h)) : undefined;
    if (radius)
      shape.radius = round2(radius);
    return shape;
  }
  const [radii = "", at] = body.split(/\s+at\s+/);
  const pos = at ? splitTop(at, " ") : ["center", "center"];
  const keyword = (t) => /^(left|top|center|right|bottom)$/.test(t) ? fraction(t) : undefined;
  const kx = keyword(pos[0]), ky = keyword(pos[1] ?? "center");
  const cx = kx !== undefined ? kx * w : resolveLength(pos[0], w);
  const cy = ky !== undefined ? ky * h : resolveLength(pos[1] ?? "", h);
  if (cx === undefined || cy === undefined)
    return;
  const [rxT = "closest-side", ryT = rxT] = splitTop(radii, " ");
  if (m[1] === "circle") {
    const sides = [cx, w - cx, cy, h - cy];
    const r = rxT === "closest-side" ? Math.min(...sides) : rxT === "farthest-side" ? Math.max(...sides) : resolveLength(rxT, Math.hypot(w, h) / Math.SQRT2);
    return r === undefined ? undefined : { kind: "circle", cx: round2(cx), cy: round2(cy), r: round2(r) };
  }
  const radius = (t, ref, side) => t === "closest-side" ? side : t === "farthest-side" ? ref - side : resolveLength(t, ref);
  const rx = radius(rxT, w, Math.min(cx, w - cx)), ry = radius(ryT, h, Math.min(cy, h - cy));
  if (rx === undefined || ry === undefined)
    return;
  return { kind: "ellipse", cx: round2(cx), cy: round2(cy), rx: round2(rx), ry: round2(ry) };
}
// src/css/svg-intrinsic.ts
var UNITS = {
  px: 1,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
  pt: 96 / 72,
  pc: 16,
  em: 16,
  rem: 16
};
function length(raw) {
  if (raw === undefined || raw.trim().endsWith("%"))
    return {};
  const match = /^\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*([a-z]*)\s*$/i.exec(raw);
  if (!match)
    return { unsupported: true };
  const unit = (match[2] || "px").toLowerCase();
  const factor = UNITS[unit];
  if (factor === undefined)
    return { unsupported: true };
  const px = Number(match[1]) * factor;
  return px > 0 ? { px } : { invalid: true };
}
function svgRootDimensions(attrs, fallbackBox = [300, 150]) {
  const width = length(attrs["width"]), height = length(attrs["height"]);
  const notes = [];
  for (const [name, parsed] of [["width", width], ["height", height]]) {
    if (parsed.unsupported)
      notes.push(`approximated: SVG intrinsic ${name} ${attrs[name]} is unsupported; viewBox ratio used`);
    else if (parsed.px !== undefined && /(?:em|rem)\s*$/i.test(attrs[name] ?? ""))
      notes.push(`approximated: SVG intrinsic ${name} ${attrs[name]} assumes 16px font size`);
  }
  const rawViewBox = attrs["viewbox"] ?? attrs["viewBox"];
  const vb = rawViewBox ? rawViewBox.trim().split(/[\s,]+/).map(Number) : undefined;
  let viewBox;
  if (vb) {
    if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v)) || vb[2] <= 0 || vb[3] <= 0)
      return;
    viewBox = vb;
  } else {
    if (width.px === undefined || height.px === undefined)
      return;
    viewBox = [0, 0, width.px, height.px];
  }
  if (width.invalid || height.invalid) {
    const axis = [width.invalid ? "width" : "", height.invalid ? "height" : ""].filter(Boolean).join(" and ");
    return { viewBox, notes, invalid: `SVG intrinsic ${axis} is non-positive` };
  }
  const [, , vw, vh] = viewBox;
  let w = width.px, h = height.px;
  if (w === undefined && h === undefined) {
    const scale = Math.min(fallbackBox[0] / vw, fallbackBox[1] / vh);
    w = vw * scale;
    h = vh * scale;
  } else if (w === undefined)
    w = h * vw / vh;
  else if (h === undefined)
    h = w * vh / vw;
  return { size: [w, h], viewBox, notes };
}

// node_modules/entities/lib/esm/generated/decode-data-html.js
var decode_data_html_default = new Uint16Array("ᵁ<Õıʊҝջאٵ۞ޢߖࠏ੊ઑඡ๭༉༦჊ረዡᐕᒝᓃᓟᔥ\x00\x00\x00\x00\x00\x00ᕫᛍᦍᰒᷝ὾⁠↰⊍⏀⏻⑂⠤⤒ⴈ⹈⿎〖㊺㘹㞬㣾㨨㩱㫠㬮ࠀEMabcfglmnoprstu\\bfms¦³¹ÈÏlig耻Æ䃆P耻&䀦cute耻Á䃁reve;䄂Āiyx}rc耻Â䃂;䐐r;쀀\uD835\uDD04rave耻À䃀pha;䎑acr;䄀d;橓Āgp¡on;䄄f;쀀\uD835\uDD38plyFunction;恡ing耻Å䃅Ācs¾Ãr;쀀\uD835\uDC9Cign;扔ilde耻Ã䃃ml耻Ä䃄ЀaceforsuåûþėĜĢħĪĀcrêòkslash;或Ŷöø;櫧ed;挆y;䐑ƀcrtąċĔause;戵noullis;愬a;䎒r;쀀\uD835\uDD05pf;쀀\uD835\uDD39eve;䋘còēmpeq;扎܀HOacdefhilorsuōőŖƀƞƢƵƷƺǜȕɳɸɾcy;䐧PY耻©䂩ƀcpyŝŢźute;䄆Ā;iŧŨ拒talDifferentialD;慅leys;愭ȀaeioƉƎƔƘron;䄌dil耻Ç䃇rc;䄈nint;戰ot;䄊ĀdnƧƭilla;䂸terDot;䂷òſi;䎧rcleȀDMPTǇǋǑǖot;抙inus;抖lus;投imes;抗oĀcsǢǸkwiseContourIntegral;戲eCurlyĀDQȃȏoubleQuote;思uote;怙ȀlnpuȞȨɇɕonĀ;eȥȦ户;橴ƀgitȯȶȺruent;扡nt;戯ourIntegral;戮ĀfrɌɎ;愂oduct;成nterClockwiseContourIntegral;戳oss;樯cr;쀀\uD835\uDC9EpĀ;Cʄʅ拓ap;才րDJSZacefiosʠʬʰʴʸˋ˗ˡ˦̳ҍĀ;oŹʥtrahd;椑cy;䐂cy;䐅cy;䐏ƀgrsʿ˄ˇger;怡r;憡hv;櫤Āayː˕ron;䄎;䐔lĀ;t˝˞戇a;䎔r;쀀\uD835\uDD07Āaf˫̧Ācm˰̢riticalȀADGT̖̜̀̆cute;䂴oŴ̋̍;䋙bleAcute;䋝rave;䁠ilde;䋜ond;拄ferentialD;慆Ѱ̽\x00\x00\x00͔͂\x00Ѕf;쀀\uD835\uDD3Bƀ;DE͈͉͍䂨ot;惜qual;扐blèCDLRUVͣͲ΂ϏϢϸontourIntegraìȹoɴ͹\x00\x00ͻ»͉nArrow;懓Āeo·ΤftƀARTΐΖΡrrow;懐ightArrow;懔eåˊngĀLRΫτeftĀARγιrrow;柸ightArrow;柺ightArrow;柹ightĀATϘϞrrow;懒ee;抨pɁϩ\x00\x00ϯrrow;懑ownArrow;懕erticalBar;戥ǹABLRTaВЪаўѿͼrrowƀ;BUНОТ憓ar;椓pArrow;懵reve;䌑eft˒к\x00ц\x00ѐightVector;楐eeVector;楞ectorĀ;Bљњ憽ar;楖ightǔѧ\x00ѱeeVector;楟ectorĀ;BѺѻ懁ar;楗eeĀ;A҆҇护rrow;憧ĀctҒҗr;쀀\uD835\uDC9Frok;䄐ࠀNTacdfglmopqstuxҽӀӄӋӞӢӧӮӵԡԯԶՒ՝ՠեG;䅊H耻Ð䃐cute耻É䃉ƀaiyӒӗӜron;䄚rc耻Ê䃊;䐭ot;䄖r;쀀\uD835\uDD08rave耻È䃈ement;戈ĀapӺӾcr;䄒tyɓԆ\x00\x00ԒmallSquare;旻erySmallSquare;斫ĀgpԦԪon;䄘f;쀀\uD835\uDD3Csilon;䎕uĀaiԼՉlĀ;TՂՃ橵ilde;扂librium;懌Āci՗՚r;愰m;橳a;䎗ml耻Ë䃋Āipժկsts;戃onentialE;慇ʀcfiosօֈ֍ֲ׌y;䐤r;쀀\uD835\uDD09lledɓ֗\x00\x00֣mallSquare;旼erySmallSquare;斪Ͱֺ\x00ֿ\x00\x00ׄf;쀀\uD835\uDD3DAll;戀riertrf;愱cò׋؀JTabcdfgorstר׬ׯ׺؀ؒؖ؛؝أ٬ٲcy;䐃耻>䀾mmaĀ;d׷׸䎓;䏜reve;䄞ƀeiy؇،ؐdil;䄢rc;䄜;䐓ot;䄠r;쀀\uD835\uDD0A;拙pf;쀀\uD835\uDD3Eeater̀EFGLSTصلَٖٛ٦qualĀ;Lؾؿ扥ess;招ullEqual;执reater;檢ess;扷lantEqual;橾ilde;扳cr;쀀\uD835\uDCA2;扫ЀAacfiosuڅڋږڛڞڪھۊRDcy;䐪Āctڐڔek;䋇;䁞irc;䄤r;愌lbertSpace;愋ǰگ\x00ڲf;愍izontalLine;攀Āctۃۅòکrok;䄦mpńېۘownHumðįqual;扏܀EJOacdfgmnostuۺ۾܃܇܎ܚܞܡܨ݄ݸދޏޕcy;䐕lig;䄲cy;䐁cute耻Í䃍Āiyܓܘrc耻Î䃎;䐘ot;䄰r;愑rave耻Ì䃌ƀ;apܠܯܿĀcgܴܷr;䄪inaryI;慈lieóϝǴ݉\x00ݢĀ;eݍݎ戬Āgrݓݘral;戫section;拂isibleĀCTݬݲomma;恣imes;恢ƀgptݿރވon;䄮f;쀀\uD835\uDD40a;䎙cr;愐ilde;䄨ǫޚ\x00ޞcy;䐆l耻Ï䃏ʀcfosuެ޷޼߂ߐĀiyޱ޵rc;䄴;䐙r;쀀\uD835\uDD0Dpf;쀀\uD835\uDD41ǣ߇\x00ߌr;쀀\uD835\uDCA5rcy;䐈kcy;䐄΀HJacfosߤߨ߽߬߱ࠂࠈcy;䐥cy;䐌ppa;䎚Āey߶߻dil;䄶;䐚r;쀀\uD835\uDD0Epf;쀀\uD835\uDD42cr;쀀\uD835\uDCA6րJTaceflmostࠥࠩࠬࡐࡣ঳সে্਷ੇcy;䐉耻<䀼ʀcmnpr࠷࠼ࡁࡄࡍute;䄹bda;䎛g;柪lacetrf;愒r;憞ƀaeyࡗ࡜ࡡron;䄽dil;䄻;䐛Āfsࡨ॰tԀACDFRTUVarࡾࢩࢱࣦ࣠ࣼयज़ΐ४Ānrࢃ࢏gleBracket;柨rowƀ;BR࢙࢚࢞憐ar;懤ightArrow;懆eiling;挈oǵࢷ\x00ࣃbleBracket;柦nǔࣈ\x00࣒eeVector;楡ectorĀ;Bࣛࣜ懃ar;楙loor;挊ightĀAV࣯ࣵrrow;憔ector;楎Āerँगeƀ;AVउऊऐ抣rrow;憤ector;楚iangleƀ;BEतथऩ抲ar;槏qual;抴pƀDTVषूौownVector;楑eeVector;楠ectorĀ;Bॖॗ憿ar;楘ectorĀ;B॥०憼ar;楒ightáΜs̀EFGLSTॾঋকঝঢভqualGreater;拚ullEqual;扦reater;扶ess;檡lantEqual;橽ilde;扲r;쀀\uD835\uDD0FĀ;eঽা拘ftarrow;懚idot;䄿ƀnpw৔ਖਛgȀLRlr৞৷ਂਐeftĀAR০৬rrow;柵ightArrow;柷ightArrow;柶eftĀarγਊightáοightáϊf;쀀\uD835\uDD43erĀLRਢਬeftArrow;憙ightArrow;憘ƀchtਾੀੂòࡌ;憰rok;䅁;扪Ѐacefiosuਗ਼੝੠੷੼અઋ઎p;椅y;䐜Ādl੥੯iumSpace;恟lintrf;愳r;쀀\uD835\uDD10nusPlus;戓pf;쀀\uD835\uDD44cò੶;䎜ҀJacefostuણધભીଔଙඑ඗ඞcy;䐊cute;䅃ƀaey઴હાron;䅇dil;䅅;䐝ƀgswે૰଎ativeƀMTV૓૟૨ediumSpace;怋hiĀcn૦૘ë૙eryThiî૙tedĀGL૸ଆreaterGreateòٳessLesóੈLine;䀊r;쀀\uD835\uDD11ȀBnptଢନଷ଺reak;恠BreakingSpace;䂠f;愕ڀ;CDEGHLNPRSTV୕ୖ୪୼஡௫ఄ౞಄ದ೘ൡඅ櫬Āou୛୤ngruent;扢pCap;扭oubleVerticalBar;戦ƀlqxஃஊ஛ement;戉ualĀ;Tஒஓ扠ilde;쀀≂̸ists;戄reater΀;EFGLSTஶஷ஽௉௓௘௥扯qual;扱ullEqual;쀀≧̸reater;쀀≫̸ess;批lantEqual;쀀⩾̸ilde;扵umpń௲௽ownHump;쀀≎̸qual;쀀≏̸eĀfsఊధtTriangleƀ;BEచఛడ拪ar;쀀⧏̸qual;括s̀;EGLSTవశ఼ౄోౘ扮qual;扰reater;扸ess;쀀≪̸lantEqual;쀀⩽̸ilde;扴estedĀGL౨౹reaterGreater;쀀⪢̸essLess;쀀⪡̸recedesƀ;ESಒಓಛ技qual;쀀⪯̸lantEqual;拠ĀeiಫಹverseElement;戌ghtTriangleƀ;BEೋೌ೒拫ar;쀀⧐̸qual;拭ĀquೝഌuareSuĀbp೨೹setĀ;E೰ೳ쀀⊏̸qual;拢ersetĀ;Eഃആ쀀⊐̸qual;拣ƀbcpഓതൎsetĀ;Eഛഞ쀀⊂⃒qual;抈ceedsȀ;ESTലള഻െ抁qual;쀀⪰̸lantEqual;拡ilde;쀀≿̸ersetĀ;E൘൛쀀⊃⃒qual;抉ildeȀ;EFT൮൯൵ൿ扁qual;扄ullEqual;扇ilde;扉erticalBar;戤cr;쀀\uD835\uDCA9ilde耻Ñ䃑;䎝܀Eacdfgmoprstuvලෂ෉෕ෛ෠෧෼ขภยา฿ไlig;䅒cute耻Ó䃓Āiy෎ීrc耻Ô䃔;䐞blac;䅐r;쀀\uD835\uDD12rave耻Ò䃒ƀaei෮ෲ෶cr;䅌ga;䎩cron;䎟pf;쀀\uD835\uDD46enCurlyĀDQฎบoubleQuote;怜uote;怘;橔Āclวฬr;쀀\uD835\uDCAAash耻Ø䃘iŬื฼de耻Õ䃕es;樷ml耻Ö䃖erĀBP๋๠Āar๐๓r;怾acĀek๚๜;揞et;掴arenthesis;揜Ҁacfhilors๿ງຊຏຒດຝະ໼rtialD;戂y;䐟r;쀀\uD835\uDD13i;䎦;䎠usMinus;䂱Āipຢອncareplanåڝf;愙Ȁ;eio຺ູ໠໤檻cedesȀ;EST່້໏໚扺qual;檯lantEqual;扼ilde;找me;怳Ādp໩໮uct;戏ortionĀ;aȥ໹l;戝Āci༁༆r;쀀\uD835\uDCAB;䎨ȀUfos༑༖༛༟OT耻\"䀢r;쀀\uD835\uDD14pf;愚cr;쀀\uD835\uDCAC؀BEacefhiorsu༾གྷཇའཱིྦྷྪྭ႖ႩႴႾarr;椐G耻®䂮ƀcnrཎནབute;䅔g;柫rĀ;tཛྷཝ憠l;椖ƀaeyཧཬཱron;䅘dil;䅖;䐠Ā;vླྀཹ愜erseĀEUྂྙĀlq྇ྎement;戋uilibrium;懋pEquilibrium;楯r»ཹo;䎡ghtЀACDFTUVa࿁࿫࿳ဢဨၛႇϘĀnr࿆࿒gleBracket;柩rowƀ;BL࿜࿝࿡憒ar;懥eftArrow;懄eiling;按oǵ࿹\x00စbleBracket;柧nǔည\x00နeeVector;楝ectorĀ;Bဝသ懂ar;楕loor;挋Āerိ၃eƀ;AVဵံြ抢rrow;憦ector;楛iangleƀ;BEၐၑၕ抳ar;槐qual;抵pƀDTVၣၮၸownVector;楏eeVector;楜ectorĀ;Bႂႃ憾ar;楔ectorĀ;B႑႒懀ar;楓Āpuႛ႞f;愝ndImplies;楰ightarrow;懛ĀchႹႼr;愛;憱leDelayed;槴ڀHOacfhimoqstuფჱჷჽᄙᄞᅑᅖᅡᅧᆵᆻᆿĀCcჩხHcy;䐩y;䐨FTcy;䐬cute;䅚ʀ;aeiyᄈᄉᄎᄓᄗ檼ron;䅠dil;䅞rc;䅜;䐡r;쀀\uD835\uDD16ortȀDLRUᄪᄴᄾᅉownArrow»ОeftArrow»࢚ightArrow»࿝pArrow;憑gma;䎣allCircle;战pf;쀀\uD835\uDD4Aɲᅭ\x00\x00ᅰt;戚areȀ;ISUᅻᅼᆉᆯ斡ntersection;抓uĀbpᆏᆞsetĀ;Eᆗᆘ抏qual;抑ersetĀ;Eᆨᆩ抐qual;抒nion;抔cr;쀀\uD835\uDCAEar;拆ȀbcmpᇈᇛሉላĀ;sᇍᇎ拐etĀ;Eᇍᇕqual;抆ĀchᇠህeedsȀ;ESTᇭᇮᇴᇿ扻qual;檰lantEqual;扽ilde;承Tháྌ;我ƀ;esሒሓሣ拑rsetĀ;Eሜም抃qual;抇et»ሓրHRSacfhiorsሾቄ቉ቕ቞ቱቶኟዂወዑORN耻Þ䃞ADE;愢ĀHc቎ቒcy;䐋y;䐦Ābuቚቜ;䀉;䎤ƀaeyብቪቯron;䅤dil;䅢;䐢r;쀀\uD835\uDD17Āeiቻ኉ǲኀ\x00ኇefore;戴a;䎘Ācn኎ኘkSpace;쀀  Space;怉ldeȀ;EFTካኬኲኼ戼qual;扃ullEqual;扅ilde;扈pf;쀀\uD835\uDD4BipleDot;惛Āctዖዛr;쀀\uD835\uDCAFrok;䅦ૡዷጎጚጦ\x00ጬጱ\x00\x00\x00\x00\x00ጸጽ፷ᎅ\x00᏿ᐄᐊᐐĀcrዻጁute耻Ú䃚rĀ;oጇገ憟cir;楉rǣጓ\x00጖y;䐎ve;䅬Āiyጞጣrc耻Û䃛;䐣blac;䅰r;쀀\uD835\uDD18rave耻Ù䃙acr;䅪Ādiፁ፩erĀBPፈ፝Āarፍፐr;䁟acĀekፗፙ;揟et;掵arenthesis;揝onĀ;P፰፱拃lus;抎Āgp፻፿on;䅲f;쀀\uD835\uDD4CЀADETadps᎕ᎮᎸᏄϨᏒᏗᏳrrowƀ;BDᅐᎠᎤar;椒ownArrow;懅ownArrow;憕quilibrium;楮eeĀ;AᏋᏌ报rrow;憥ownáϳerĀLRᏞᏨeftArrow;憖ightArrow;憗iĀ;lᏹᏺ䏒on;䎥ing;䅮cr;쀀\uD835\uDCB0ilde;䅨ml耻Ü䃜ҀDbcdefosvᐧᐬᐰᐳᐾᒅᒊᒐᒖash;披ar;櫫y;䐒ashĀ;lᐻᐼ抩;櫦Āerᑃᑅ;拁ƀbtyᑌᑐᑺar;怖Ā;iᑏᑕcalȀBLSTᑡᑥᑪᑴar;戣ine;䁼eparator;杘ilde;所ThinSpace;怊r;쀀\uD835\uDD19pf;쀀\uD835\uDD4Dcr;쀀\uD835\uDCB1dash;抪ʀcefosᒧᒬᒱᒶᒼirc;䅴dge;拀r;쀀\uD835\uDD1Apf;쀀\uD835\uDD4Ecr;쀀\uD835\uDCB2Ȁfiosᓋᓐᓒᓘr;쀀\uD835\uDD1B;䎞pf;쀀\uD835\uDD4Fcr;쀀\uD835\uDCB3ҀAIUacfosuᓱᓵᓹᓽᔄᔏᔔᔚᔠcy;䐯cy;䐇cy;䐮cute耻Ý䃝Āiyᔉᔍrc;䅶;䐫r;쀀\uD835\uDD1Cpf;쀀\uD835\uDD50cr;쀀\uD835\uDCB4ml;䅸ЀHacdefosᔵᔹᔿᕋᕏᕝᕠᕤcy;䐖cute;䅹Āayᕄᕉron;䅽;䐗ot;䅻ǲᕔ\x00ᕛoWidtè૙a;䎖r;愨pf;愤cr;쀀\uD835\uDCB5௡ᖃᖊᖐ\x00ᖰᖶᖿ\x00\x00\x00\x00ᗆᗛᗫᙟ᙭\x00ᚕ᚛ᚲᚹ\x00ᚾcute耻á䃡reve;䄃̀;Ediuyᖜᖝᖡᖣᖨᖭ戾;쀀∾̳;房rc耻â䃢te肻´̆;䐰lig耻æ䃦Ā;r²ᖺ;쀀\uD835\uDD1Erave耻à䃠ĀepᗊᗖĀfpᗏᗔsym;愵èᗓha;䎱ĀapᗟcĀclᗤᗧr;䄁g;樿ɤᗰ\x00\x00ᘊʀ;adsvᗺᗻᗿᘁᘇ戧nd;橕;橜lope;橘;橚΀;elmrszᘘᘙᘛᘞᘿᙏᙙ戠;榤e»ᘙsdĀ;aᘥᘦ戡ѡᘰᘲᘴᘶᘸᘺᘼᘾ;榨;榩;榪;榫;榬;榭;榮;榯tĀ;vᙅᙆ戟bĀ;dᙌᙍ抾;榝Āptᙔᙗh;戢»¹arr;捼Āgpᙣᙧon;䄅f;쀀\uD835\uDD52΀;Eaeiop዁ᙻᙽᚂᚄᚇᚊ;橰cir;橯;扊d;手s;䀧roxĀ;e዁ᚒñᚃing耻å䃥ƀctyᚡᚦᚨr;쀀\uD835\uDCB6;䀪mpĀ;e዁ᚯñʈilde耻ã䃣ml耻ä䃤Āciᛂᛈoninôɲnt;樑ࠀNabcdefiklnoprsu᛭ᛱᜰ᜼ᝃᝈ᝸᝽០៦ᠹᡐᜍ᤽᥈ᥰot;櫭Ācrᛶ᜞kȀcepsᜀᜅᜍᜓong;扌psilon;䏶rime;怵imĀ;e᜚᜛戽q;拍Ŷᜢᜦee;抽edĀ;gᜬᜭ挅e»ᜭrkĀ;t፜᜷brk;掶Āoyᜁᝁ;䐱quo;怞ʀcmprtᝓ᝛ᝡᝤᝨausĀ;eĊĉptyv;榰séᜌnoõēƀahwᝯ᝱ᝳ;䎲;愶een;扬r;쀀\uD835\uDD1Fg΀costuvwឍឝឳេ៕៛៞ƀaiuបពរðݠrc;旯p»፱ƀdptឤឨឭot;樀lus;樁imes;樂ɱឹ\x00\x00ើcup;樆ar;昅riangleĀdu៍្own;施p;斳plus;樄eåᑄåᒭarow;植ƀako៭ᠦᠵĀcn៲ᠣkƀlst៺֫᠂ozenge;槫riangleȀ;dlr᠒᠓᠘᠝斴own;斾eft;旂ight;斸k;搣Ʊᠫ\x00ᠳƲᠯ\x00ᠱ;斒;斑4;斓ck;斈ĀeoᠾᡍĀ;qᡃᡆ쀀=⃥uiv;쀀≡⃥t;挐Ȁptwxᡙᡞᡧᡬf;쀀\uD835\uDD53Ā;tᏋᡣom»Ꮜtie;拈؀DHUVbdhmptuvᢅᢖᢪᢻᣗᣛᣬ᣿ᤅᤊᤐᤡȀLRlrᢎᢐᢒᢔ;敗;敔;敖;敓ʀ;DUduᢡᢢᢤᢦᢨ敐;敦;敩;敤;敧ȀLRlrᢳᢵᢷᢹ;敝;敚;敜;教΀;HLRhlrᣊᣋᣍᣏᣑᣓᣕ救;敬;散;敠;敫;敢;敟ox;槉ȀLRlrᣤᣦᣨᣪ;敕;敒;攐;攌ʀ;DUduڽ᣷᣹᣻᣽;敥;敨;攬;攴inus;抟lus;択imes;抠ȀLRlrᤙᤛᤝ᤟;敛;敘;攘;攔΀;HLRhlrᤰᤱᤳᤵᤷ᤻᤹攂;敪;敡;敞;攼;攤;攜Āevģ᥂bar耻¦䂦Ȁceioᥑᥖᥚᥠr;쀀\uD835\uDCB7mi;恏mĀ;e᜚᜜lƀ;bhᥨᥩᥫ䁜;槅sub;柈Ŭᥴ᥾lĀ;e᥹᥺怢t»᥺pƀ;Eeįᦅᦇ;檮Ā;qۜۛೡᦧ\x00᧨ᨑᨕᨲ\x00ᨷᩐ\x00\x00᪴\x00\x00᫁\x00\x00ᬡᬮ᭍᭒\x00᯽\x00ᰌƀcpr᦭ᦲ᧝ute;䄇̀;abcdsᦿᧀᧄ᧊᧕᧙戩nd;橄rcup;橉Āau᧏᧒p;橋p;橇ot;橀;쀀∩︀Āeo᧢᧥t;恁îړȀaeiu᧰᧻ᨁᨅǰ᧵\x00᧸s;橍on;䄍dil耻ç䃧rc;䄉psĀ;sᨌᨍ橌m;橐ot;䄋ƀdmnᨛᨠᨦil肻¸ƭptyv;榲t脀¢;eᨭᨮ䂢räƲr;쀀\uD835\uDD20ƀceiᨽᩀᩍy;䑇ckĀ;mᩇᩈ朓ark»ᩈ;䏇r΀;Ecefms᩟᩠ᩢᩫ᪤᪪᪮旋;槃ƀ;elᩩᩪᩭ䋆q;扗eɡᩴ\x00\x00᪈rrowĀlr᩼᪁eft;憺ight;憻ʀRSacd᪒᪔᪖᪚᪟»ཇ;擈st;抛irc;抚ash;抝nint;樐id;櫯cir;槂ubsĀ;u᪻᪼晣it»᪼ˬ᫇᫔᫺\x00ᬊonĀ;eᫍᫎ䀺Ā;qÇÆɭ᫙\x00\x00᫢aĀ;t᫞᫟䀬;䁀ƀ;fl᫨᫩᫫戁îᅠeĀmx᫱᫶ent»᫩eóɍǧ᫾\x00ᬇĀ;dኻᬂot;橭nôɆƀfryᬐᬔᬗ;쀀\uD835\uDD54oäɔ脀©;sŕᬝr;愗Āaoᬥᬩrr;憵ss;朗Ācuᬲᬷr;쀀\uD835\uDCB8Ābpᬼ᭄Ā;eᭁᭂ櫏;櫑Ā;eᭉᭊ櫐;櫒dot;拯΀delprvw᭠᭬᭷ᮂᮬᯔ᯹arrĀlr᭨᭪;椸;椵ɰ᭲\x00\x00᭵r;拞c;拟arrĀ;p᭿ᮀ憶;椽̀;bcdosᮏᮐᮖᮡᮥᮨ截rcap;橈Āauᮛᮞp;橆p;橊ot;抍r;橅;쀀∪︀Ȁalrv᮵ᮿᯞᯣrrĀ;mᮼᮽ憷;椼yƀevwᯇᯔᯘqɰᯎ\x00\x00ᯒreã᭳uã᭵ee;拎edge;拏en耻¤䂤earrowĀlrᯮ᯳eft»ᮀight»ᮽeäᯝĀciᰁᰇoninôǷnt;戱lcty;挭ঀAHabcdefhijlorstuwz᰸᰻᰿ᱝᱩᱵᲊᲞᲬᲷ᳻᳿ᴍᵻᶑᶫᶻ᷆᷍rò΁ar;楥Ȁglrs᱈ᱍ᱒᱔ger;怠eth;愸òᄳhĀ;vᱚᱛ怐»ऊūᱡᱧarow;椏aã̕Āayᱮᱳron;䄏;䐴ƀ;ao̲ᱼᲄĀgrʿᲁr;懊tseq;橷ƀglmᲑᲔᲘ耻°䂰ta;䎴ptyv;榱ĀirᲣᲨsht;楿;쀀\uD835\uDD21arĀlrᲳᲵ»ࣜ»သʀaegsv᳂͸᳖᳜᳠mƀ;oș᳊᳔ndĀ;ș᳑uit;晦amma;䏝in;拲ƀ;io᳧᳨᳸䃷de脀÷;o᳧ᳰntimes;拇nø᳷cy;䑒cɯᴆ\x00\x00ᴊrn;挞op;挍ʀlptuwᴘᴝᴢᵉᵕlar;䀤f;쀀\uD835\uDD55ʀ;emps̋ᴭᴷᴽᵂqĀ;d͒ᴳot;扑inus;戸lus;戔quare;抡blebarwedgåúnƀadhᄮᵝᵧownarrowóᲃarpoonĀlrᵲᵶefôᲴighôᲶŢᵿᶅkaro÷གɯᶊ\x00\x00ᶎrn;挟op;挌ƀcotᶘᶣᶦĀryᶝᶡ;쀀\uD835\uDCB9;䑕l;槶rok;䄑Ādrᶰᶴot;拱iĀ;fᶺ᠖斿Āah᷀᷃ròЩaòྦangle;榦Āci᷒ᷕy;䑟grarr;柿ऀDacdefglmnopqrstuxḁḉḙḸոḼṉṡṾấắẽỡἪἷὄ὎὚ĀDoḆᴴoôᲉĀcsḎḔute耻é䃩ter;橮ȀaioyḢḧḱḶron;䄛rĀ;cḭḮ扖耻ê䃪lon;払;䑍ot;䄗ĀDrṁṅot;扒;쀀\uD835\uDD22ƀ;rsṐṑṗ檚ave耻è䃨Ā;dṜṝ檖ot;檘Ȁ;ilsṪṫṲṴ檙nters;揧;愓Ā;dṹṺ檕ot;檗ƀapsẅẉẗcr;䄓tyƀ;svẒẓẕ戅et»ẓpĀ1;ẝẤĳạả;怄;怅怃ĀgsẪẬ;䅋p;怂ĀgpẴẸon;䄙f;쀀\uD835\uDD56ƀalsỄỎỒrĀ;sỊị拕l;槣us;橱iƀ;lvỚớở䎵on»ớ;䏵ȀcsuvỪỳἋἣĀioữḱrc»Ḯɩỹ\x00\x00ỻíՈantĀglἂἆtr»ṝess»Ṻƀaeiἒ἖Ἒls;䀽st;扟vĀ;DȵἠD;橸parsl;槥ĀDaἯἳot;打rr;楱ƀcdiἾὁỸr;愯oô͒ĀahὉὋ;䎷耻ð䃰Āmrὓὗl耻ë䃫o;悬ƀcipὡὤὧl;䀡sôծĀeoὬὴctatioîՙnentialåչৡᾒ\x00ᾞ\x00ᾡᾧ\x00\x00ῆῌ\x00ΐ\x00ῦῪ \x00 ⁚llingdotseñṄy;䑄male;晀ƀilrᾭᾳ῁lig;耀ﬃɩᾹ\x00\x00᾽g;耀ﬀig;耀ﬄ;쀀\uD835\uDD23lig;耀ﬁlig;쀀fjƀaltῙ῜ῡt;晭ig;耀ﬂns;斱of;䆒ǰ΅\x00ῳf;쀀\uD835\uDD57ĀakֿῷĀ;vῼ´拔;櫙artint;樍Āao‌⁕Ācs‑⁒α‚‰‸⁅⁈\x00⁐β•‥‧‪‬\x00‮耻½䂽;慓耻¼䂼;慕;慙;慛Ƴ‴\x00‶;慔;慖ʴ‾⁁\x00\x00⁃耻¾䂾;慗;慜5;慘ƶ⁌\x00⁎;慚;慝8;慞l;恄wn;挢cr;쀀\uD835\uDCBBࢀEabcdefgijlnorstv₂₉₟₥₰₴⃰⃵⃺⃿℃ℒℸ̗ℾ⅒↞Ā;lٍ₇;檌ƀcmpₐₕ₝ute;䇵maĀ;dₜ᳚䎳;檆reve;䄟Āiy₪₮rc;䄝;䐳ot;䄡Ȁ;lqsؾق₽⃉ƀ;qsؾٌ⃄lanô٥Ȁ;cdl٥⃒⃥⃕c;檩otĀ;o⃜⃝檀Ā;l⃢⃣檂;檄Ā;e⃪⃭쀀⋛︀s;檔r;쀀\uD835\uDD24Ā;gٳ؛mel;愷cy;䑓Ȁ;Eajٚℌℎℐ;檒;檥;檤ȀEaesℛℝ℩ℴ;扩pĀ;p℣ℤ檊rox»ℤĀ;q℮ℯ檈Ā;q℮ℛim;拧pf;쀀\uD835\uDD58Āci⅃ⅆr;愊mƀ;el٫ⅎ⅐;檎;檐茀>;cdlqr׮ⅠⅪⅮⅳⅹĀciⅥⅧ;檧r;橺ot;拗Par;榕uest;橼ʀadelsↄⅪ←ٖ↛ǰ↉\x00↎proø₞r;楸qĀlqؿ↖lesó₈ií٫Āen↣↭rtneqq;쀀≩︀Å↪ԀAabcefkosy⇄⇇⇱⇵⇺∘∝∯≨≽ròΠȀilmr⇐⇔⇗⇛rsðᒄf»․ilôکĀdr⇠⇤cy;䑊ƀ;cwࣴ⇫⇯ir;楈;憭ar;意irc;䄥ƀalr∁∎∓rtsĀ;u∉∊晥it»∊lip;怦con;抹r;쀀\uD835\uDD25sĀew∣∩arow;椥arow;椦ʀamopr∺∾≃≞≣rr;懿tht;戻kĀlr≉≓eftarrow;憩ightarrow;憪f;쀀\uD835\uDD59bar;怕ƀclt≯≴≸r;쀀\uD835\uDCBDasè⇴rok;䄧Ābp⊂⊇ull;恃hen»ᱛૡ⊣\x00⊪\x00⊸⋅⋎\x00⋕⋳\x00\x00⋸⌢⍧⍢⍿\x00⎆⎪⎴cute耻í䃭ƀ;iyݱ⊰⊵rc耻î䃮;䐸Ācx⊼⊿y;䐵cl耻¡䂡ĀfrΟ⋉;쀀\uD835\uDD26rave耻ì䃬Ȁ;inoܾ⋝⋩⋮Āin⋢⋦nt;樌t;戭fin;槜ta;愩lig;䄳ƀaop⋾⌚⌝ƀcgt⌅⌈⌗r;䄫ƀelpܟ⌏⌓inåގarôܠh;䄱f;抷ed;䆵ʀ;cfotӴ⌬⌱⌽⍁are;愅inĀ;t⌸⌹戞ie;槝doô⌙ʀ;celpݗ⍌⍐⍛⍡al;抺Āgr⍕⍙eróᕣã⍍arhk;樗rod;樼Ȁcgpt⍯⍲⍶⍻y;䑑on;䄯f;쀀\uD835\uDD5Aa;䎹uest耻¿䂿Āci⎊⎏r;쀀\uD835\uDCBEnʀ;EdsvӴ⎛⎝⎡ӳ;拹ot;拵Ā;v⎦⎧拴;拳Ā;iݷ⎮lde;䄩ǫ⎸\x00⎼cy;䑖l耻ï䃯̀cfmosu⏌⏗⏜⏡⏧⏵Āiy⏑⏕rc;䄵;䐹r;쀀\uD835\uDD27ath;䈷pf;쀀\uD835\uDD5Bǣ⏬\x00⏱r;쀀\uD835\uDCBFrcy;䑘kcy;䑔Ѐacfghjos␋␖␢␧␭␱␵␻ppaĀ;v␓␔䎺;䏰Āey␛␠dil;䄷;䐺r;쀀\uD835\uDD28reen;䄸cy;䑅cy;䑜pf;쀀\uD835\uDD5Ccr;쀀\uD835\uDCC0஀ABEHabcdefghjlmnoprstuv⑰⒁⒆⒍⒑┎┽╚▀♎♞♥♹♽⚚⚲⛘❝❨➋⟀⠁⠒ƀart⑷⑺⑼rò৆òΕail;椛arr;椎Ā;gঔ⒋;檋ar;楢ॣ⒥\x00⒪\x00⒱\x00\x00\x00\x00\x00⒵Ⓔ\x00ⓆⓈⓍ\x00⓹ute;䄺mptyv;榴raîࡌbda;䎻gƀ;dlࢎⓁⓃ;榑åࢎ;檅uo耻«䂫rЀ;bfhlpst࢙ⓞⓦⓩ⓫⓮⓱⓵Ā;f࢝ⓣs;椟s;椝ë≒p;憫l;椹im;楳l;憢ƀ;ae⓿─┄檫il;椙Ā;s┉┊檭;쀀⪭︀ƀabr┕┙┝rr;椌rk;杲Āak┢┬cĀek┨┪;䁻;䁛Āes┱┳;榋lĀdu┹┻;榏;榍Ȁaeuy╆╋╖╘ron;䄾Ādi═╔il;䄼ìࢰâ┩;䐻Ȁcqrs╣╦╭╽a;椶uoĀ;rนᝆĀdu╲╷har;楧shar;楋h;憲ʀ;fgqs▋▌উ◳◿扤tʀahlrt▘▤▷◂◨rrowĀ;t࢙□aé⓶arpoonĀdu▯▴own»њp»०eftarrows;懇ightƀahs◍◖◞rrowĀ;sࣴࢧarpoonó྘quigarro÷⇰hreetimes;拋ƀ;qs▋ও◺lanôবʀ;cdgsব☊☍☝☨c;檨otĀ;o☔☕橿Ā;r☚☛檁;檃Ā;e☢☥쀀⋚︀s;檓ʀadegs☳☹☽♉♋pproøⓆot;拖qĀgq♃♅ôউgtò⒌ôছiíলƀilr♕࣡♚sht;楼;쀀\uD835\uDD29Ā;Eজ♣;檑š♩♶rĀdu▲♮Ā;l॥♳;楪lk;斄cy;䑙ʀ;achtੈ⚈⚋⚑⚖rò◁orneòᴈard;楫ri;旺Āio⚟⚤dot;䅀ustĀ;a⚬⚭掰che»⚭ȀEaes⚻⚽⛉⛔;扨pĀ;p⛃⛄檉rox»⛄Ā;q⛎⛏檇Ā;q⛎⚻im;拦Ѐabnoptwz⛩⛴⛷✚✯❁❇❐Ānr⛮⛱g;柬r;懽rëࣁgƀlmr⛿✍✔eftĀar০✇ightá৲apsto;柼ightá৽parrowĀlr✥✩efô⓭ight;憬ƀafl✶✹✽r;榅;쀀\uD835\uDD5Dus;樭imes;樴š❋❏st;戗áፎƀ;ef❗❘᠀旊nge»❘arĀ;l❤❥䀨t;榓ʀachmt❳❶❼➅➇ròࢨorneòᶌarĀ;d྘➃;業;怎ri;抿̀achiqt➘➝ੀ➢➮➻quo;怹r;쀀\uD835\uDCC1mƀ;egল➪➬;檍;檏Ābu┪➳oĀ;rฟ➹;怚rok;䅂萀<;cdhilqrࠫ⟒☹⟜⟠⟥⟪⟰Āci⟗⟙;檦r;橹reå◲mes;拉arr;楶uest;橻ĀPi⟵⟹ar;榖ƀ;ef⠀भ᠛旃rĀdu⠇⠍shar;楊har;楦Āen⠗⠡rtneqq;쀀≨︀Å⠞܀Dacdefhilnopsu⡀⡅⢂⢎⢓⢠⢥⢨⣚⣢⣤ઃ⣳⤂Dot;戺Ȁclpr⡎⡒⡣⡽r耻¯䂯Āet⡗⡙;時Ā;e⡞⡟朠se»⡟Ā;sျ⡨toȀ;dluျ⡳⡷⡻owîҌefôएðᏑker;斮Āoy⢇⢌mma;権;䐼ash;怔asuredangle»ᘦr;쀀\uD835\uDD2Ao;愧ƀcdn⢯⢴⣉ro耻µ䂵Ȁ;acdᑤ⢽⣀⣄sôᚧir;櫰ot肻·Ƶusƀ;bd⣒ᤃ⣓戒Ā;uᴼ⣘;横ţ⣞⣡p;櫛ò−ðઁĀdp⣩⣮els;抧f;쀀\uD835\uDD5EĀct⣸⣽r;쀀\uD835\uDCC2pos»ᖝƀ;lm⤉⤊⤍䎼timap;抸ఀGLRVabcdefghijlmoprstuvw⥂⥓⥾⦉⦘⧚⧩⨕⨚⩘⩝⪃⪕⪤⪨⬄⬇⭄⭿⮮ⰴⱧⱼ⳩Āgt⥇⥋;쀀⋙̸Ā;v⥐௏쀀≫⃒ƀelt⥚⥲⥶ftĀar⥡⥧rrow;懍ightarrow;懎;쀀⋘̸Ā;v⥻ే쀀≪⃒ightarrow;懏ĀDd⦎⦓ash;抯ash;抮ʀbcnpt⦣⦧⦬⦱⧌la»˞ute;䅄g;쀀∠⃒ʀ;Eiop඄⦼⧀⧅⧈;쀀⩰̸d;쀀≋̸s;䅉roø඄urĀ;a⧓⧔普lĀ;s⧓ସǳ⧟\x00⧣p肻 ଷmpĀ;e௹ఀʀaeouy⧴⧾⨃⨐⨓ǰ⧹\x00⧻;橃on;䅈dil;䅆ngĀ;dൾ⨊ot;쀀⩭̸p;橂;䐽ash;怓΀;Aadqsxஒ⨩⨭⨻⩁⩅⩐rr;懗rĀhr⨳⨶k;椤Ā;oᏲᏰot;쀀≐̸uiöୣĀei⩊⩎ar;椨í஘istĀ;s஠டr;쀀\uD835\uDD2BȀEest௅⩦⩹⩼ƀ;qs஼⩭௡ƀ;qs஼௅⩴lanô௢ií௪Ā;rஶ⪁»ஷƀAap⪊⪍⪑rò⥱rr;憮ar;櫲ƀ;svྍ⪜ྌĀ;d⪡⪢拼;拺cy;䑚΀AEadest⪷⪺⪾⫂⫅⫶⫹rò⥦;쀀≦̸rr;憚r;急Ȁ;fqs఻⫎⫣⫯tĀar⫔⫙rro÷⫁ightarro÷⪐ƀ;qs఻⪺⫪lanôౕĀ;sౕ⫴»శiíౝĀ;rవ⫾iĀ;eచథiäඐĀpt⬌⬑f;쀀\uD835\uDD5F膀¬;in⬙⬚⬶䂬nȀ;Edvஉ⬤⬨⬮;쀀⋹̸ot;쀀⋵̸ǡஉ⬳⬵;拷;拶iĀ;vಸ⬼ǡಸ⭁⭃;拾;拽ƀaor⭋⭣⭩rȀ;ast୻⭕⭚⭟lleì୻l;쀀⫽⃥;쀀∂̸lint;樔ƀ;ceಒ⭰⭳uåಥĀ;cಘ⭸Ā;eಒ⭽ñಘȀAait⮈⮋⮝⮧rò⦈rrƀ;cw⮔⮕⮙憛;쀀⤳̸;쀀↝̸ghtarrow»⮕riĀ;eೋೖ΀chimpqu⮽⯍⯙⬄୸⯤⯯Ȁ;cerല⯆ഷ⯉uå൅;쀀\uD835\uDCC3ortɭ⬅\x00\x00⯖ará⭖mĀ;e൮⯟Ā;q൴൳suĀbp⯫⯭å೸åഋƀbcp⯶ⰑⰙȀ;Ees⯿ⰀഢⰄ抄;쀀⫅̸etĀ;eഛⰋqĀ;qണⰀcĀ;eലⰗñസȀ;EesⰢⰣൟⰧ抅;쀀⫆̸etĀ;e൘ⰮqĀ;qൠⰣȀgilrⰽⰿⱅⱇìௗlde耻ñ䃱çృiangleĀlrⱒⱜeftĀ;eచⱚñదightĀ;eೋⱥñ೗Ā;mⱬⱭ䎽ƀ;esⱴⱵⱹ䀣ro;愖p;怇ҀDHadgilrsⲏⲔⲙⲞⲣⲰⲶⳓⳣash;抭arr;椄p;쀀≍⃒ash;抬ĀetⲨⲬ;쀀≥⃒;쀀>⃒nfin;槞ƀAetⲽⳁⳅrr;椂;쀀≤⃒Ā;rⳊⳍ쀀<⃒ie;쀀⊴⃒ĀAtⳘⳜrr;椃rie;쀀⊵⃒im;쀀∼⃒ƀAan⳰⳴ⴂrr;懖rĀhr⳺⳽k;椣Ā;oᏧᏥear;椧ቓ᪕\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00ⴭ\x00ⴸⵈⵠⵥ⵲ⶄᬇ\x00\x00ⶍⶫ\x00ⷈⷎ\x00ⷜ⸙⸫⸾⹃Ācsⴱ᪗ute耻ó䃳ĀiyⴼⵅrĀ;c᪞ⵂ耻ô䃴;䐾ʀabios᪠ⵒⵗǈⵚlac;䅑v;樸old;榼lig;䅓Ācr⵩⵭ir;榿;쀀\uD835\uDD2Cͯ⵹\x00\x00⵼\x00ⶂn;䋛ave耻ò䃲;槁Ābmⶈ෴ar;榵Ȁacitⶕ⶘ⶥⶨrò᪀Āir⶝ⶠr;榾oss;榻nå๒;槀ƀaeiⶱⶵⶹcr;䅍ga;䏉ƀcdnⷀⷅǍron;䎿;榶pf;쀀\uD835\uDD60ƀaelⷔ⷗ǒr;榷rp;榹΀;adiosvⷪⷫⷮ⸈⸍⸐⸖戨rò᪆Ȁ;efmⷷⷸ⸂⸅橝rĀ;oⷾⷿ愴f»ⷿ耻ª䂪耻º䂺gof;抶r;橖lope;橗;橛ƀclo⸟⸡⸧ò⸁ash耻ø䃸l;折iŬⸯ⸴de耻õ䃵esĀ;aǛ⸺s;樶ml耻ö䃶bar;挽ૡ⹞\x00⹽\x00⺀⺝\x00⺢⺹\x00\x00⻋ຜ\x00⼓\x00\x00⼫⾼\x00⿈rȀ;astЃ⹧⹲຅脀¶;l⹭⹮䂶leìЃɩ⹸\x00\x00⹻m;櫳;櫽y;䐿rʀcimpt⺋⺏⺓ᡥ⺗nt;䀥od;䀮il;怰enk;怱r;쀀\uD835\uDD2Dƀimo⺨⺰⺴Ā;v⺭⺮䏆;䏕maô੶ne;明ƀ;tv⺿⻀⻈䏀chfork»´;䏖Āau⻏⻟nĀck⻕⻝kĀ;h⇴⻛;愎ö⇴sҀ;abcdemst⻳⻴ᤈ⻹⻽⼄⼆⼊⼎䀫cir;樣ir;樢Āouᵀ⼂;樥;橲n肻±ຝim;樦wo;樧ƀipu⼙⼠⼥ntint;樕f;쀀\uD835\uDD61nd耻£䂣Ԁ;Eaceinosu່⼿⽁⽄⽇⾁⾉⾒⽾⾶;檳p;檷uå໙Ā;c໎⽌̀;acens່⽙⽟⽦⽨⽾pproø⽃urlyeñ໙ñ໎ƀaes⽯⽶⽺pprox;檹qq;檵im;拨iíໟmeĀ;s⾈ຮ怲ƀEas⽸⾐⽺ð⽵ƀdfp໬⾙⾯ƀals⾠⾥⾪lar;挮ine;挒urf;挓Ā;t໻⾴ï໻rel;抰Āci⿀⿅r;쀀\uD835\uDCC5;䏈ncsp;怈̀fiopsu⿚⋢⿟⿥⿫⿱r;쀀\uD835\uDD2Epf;쀀\uD835\uDD62rime;恗cr;쀀\uD835\uDCC6ƀaeo⿸〉〓tĀei⿾々rnionóڰnt;樖stĀ;e【】䀿ñἙô༔઀ABHabcdefhilmnoprstux぀けさすムㄎㄫㅇㅢㅲㆎ㈆㈕㈤㈩㉘㉮㉲㊐㊰㊷ƀartぇおがròႳòϝail;検aròᱥar;楤΀cdenqrtとふへみわゔヌĀeuねぱ;쀀∽̱te;䅕iãᅮmptyv;榳gȀ;del࿑らるろ;榒;榥å࿑uo耻»䂻rր;abcfhlpstw࿜ガクシスゼゾダッデナp;極Ā;f࿠ゴs;椠;椳s;椞ë≝ð✮l;楅im;楴l;憣;憝Āaiパフil;椚oĀ;nホボ戶aló༞ƀabrョリヮrò៥rk;杳ĀakンヽcĀekヹ・;䁽;䁝Āes㄂㄄;榌lĀduㄊㄌ;榎;榐Ȁaeuyㄗㄜㄧㄩron;䅙Ādiㄡㄥil;䅗ì࿲âヺ;䑀Ȁclqsㄴㄷㄽㅄa;椷dhar;楩uoĀ;rȎȍh;憳ƀacgㅎㅟངlȀ;ipsླྀㅘㅛႜnåႻarôྩt;断ƀilrㅩဣㅮsht;楽;쀀\uD835\uDD2FĀaoㅷㆆrĀduㅽㅿ»ѻĀ;l႑ㆄ;楬Ā;vㆋㆌ䏁;䏱ƀgns㆕ㇹㇼht̀ahlrstㆤㆰ㇂㇘㇤㇮rrowĀ;t࿜ㆭaéトarpoonĀduㆻㆿowîㅾp»႒eftĀah㇊㇐rrowó࿪arpoonóՑightarrows;應quigarro÷ニhreetimes;拌g;䋚ingdotseñἲƀahm㈍㈐㈓rò࿪aòՑ;怏oustĀ;a㈞㈟掱che»㈟mid;櫮Ȁabpt㈲㈽㉀㉒Ānr㈷㈺g;柭r;懾rëဃƀafl㉇㉊㉎r;榆;쀀\uD835\uDD63us;樮imes;樵Āap㉝㉧rĀ;g㉣㉤䀩t;榔olint;樒arò㇣Ȁachq㉻㊀Ⴜ㊅quo;怺r;쀀\uD835\uDCC7Ābu・㊊oĀ;rȔȓƀhir㊗㊛㊠reåㇸmes;拊iȀ;efl㊪ၙᠡ㊫方tri;槎luhar;楨;愞ൡ㋕㋛㋟㌬㌸㍱\x00㍺㎤\x00\x00㏬㏰\x00㐨㑈㑚㒭㒱㓊㓱\x00㘖\x00\x00㘳cute;䅛quï➺Ԁ;Eaceinpsyᇭ㋳㋵㋿㌂㌋㌏㌟㌦㌩;檴ǰ㋺\x00㋼;檸on;䅡uåᇾĀ;dᇳ㌇il;䅟rc;䅝ƀEas㌖㌘㌛;檶p;檺im;择olint;樓iíሄ;䑁otƀ;be㌴ᵇ㌵担;橦΀Aacmstx㍆㍊㍗㍛㍞㍣㍭rr;懘rĀhr㍐㍒ë∨Ā;oਸ਼਴t耻§䂧i;䀻war;椩mĀin㍩ðnuóñt;朶rĀ;o㍶⁕쀀\uD835\uDD30Ȁacoy㎂㎆㎑㎠rp;景Āhy㎋㎏cy;䑉;䑈rtɭ㎙\x00\x00㎜iäᑤaraì⹯耻­䂭Āgm㎨㎴maƀ;fv㎱㎲㎲䏃;䏂Ѐ;deglnprካ㏅㏉㏎㏖㏞㏡㏦ot;橪Ā;q኱ኰĀ;E㏓㏔檞;檠Ā;E㏛㏜檝;檟e;扆lus;樤arr;楲aròᄽȀaeit㏸㐈㐏㐗Āls㏽㐄lsetmé㍪hp;樳parsl;槤Ādlᑣ㐔e;挣Ā;e㐜㐝檪Ā;s㐢㐣檬;쀀⪬︀ƀflp㐮㐳㑂tcy;䑌Ā;b㐸㐹䀯Ā;a㐾㐿槄r;挿f;쀀\uD835\uDD64aĀdr㑍ЂesĀ;u㑔㑕晠it»㑕ƀcsu㑠㑹㒟Āau㑥㑯pĀ;sᆈ㑫;쀀⊓︀pĀ;sᆴ㑵;쀀⊔︀uĀbp㑿㒏ƀ;esᆗᆜ㒆etĀ;eᆗ㒍ñᆝƀ;esᆨᆭ㒖etĀ;eᆨ㒝ñᆮƀ;afᅻ㒦ְrť㒫ֱ»ᅼaròᅈȀcemt㒹㒾㓂㓅r;쀀\uD835\uDCC8tmîñiì㐕aræᆾĀar㓎㓕rĀ;f㓔ឿ昆Āan㓚㓭ightĀep㓣㓪psiloîỠhé⺯s»⡒ʀbcmnp㓻㕞ሉ㖋㖎Ҁ;Edemnprs㔎㔏㔑㔕㔞㔣㔬㔱㔶抂;櫅ot;檽Ā;dᇚ㔚ot;櫃ult;櫁ĀEe㔨㔪;櫋;把lus;檿arr;楹ƀeiu㔽㕒㕕tƀ;en㔎㕅㕋qĀ;qᇚ㔏eqĀ;q㔫㔨m;櫇Ābp㕚㕜;櫕;櫓c̀;acensᇭ㕬㕲㕹㕻㌦pproø㋺urlyeñᇾñᇳƀaes㖂㖈㌛pproø㌚qñ㌗g;晪ڀ123;Edehlmnps㖩㖬㖯ሜ㖲㖴㗀㗉㗕㗚㗟㗨㗭耻¹䂹耻²䂲耻³䂳;櫆Āos㖹㖼t;檾ub;櫘Ā;dሢ㗅ot;櫄sĀou㗏㗒l;柉b;櫗arr;楻ult;櫂ĀEe㗤㗦;櫌;抋lus;櫀ƀeiu㗴㘉㘌tƀ;enሜ㗼㘂qĀ;qሢ㖲eqĀ;q㗧㗤m;櫈Ābp㘑㘓;櫔;櫖ƀAan㘜㘠㘭rr;懙rĀhr㘦㘨ë∮Ā;oਫ਩war;椪lig耻ß䃟௡㙑㙝㙠ዎ㙳㙹\x00㙾㛂\x00\x00\x00\x00\x00㛛㜃\x00㜉㝬\x00\x00\x00㞇ɲ㙖\x00\x00㙛get;挖;䏄rë๟ƀaey㙦㙫㙰ron;䅥dil;䅣;䑂lrec;挕r;쀀\uD835\uDD31Ȁeiko㚆㚝㚵㚼ǲ㚋\x00㚑eĀ4fኄኁaƀ;sv㚘㚙㚛䎸ym;䏑Ācn㚢㚲kĀas㚨㚮pproø዁im»ኬsðኞĀas㚺㚮ð዁rn耻þ䃾Ǭ̟㛆⋧es膀×;bd㛏㛐㛘䃗Ā;aᤏ㛕r;樱;樰ƀeps㛡㛣㜀á⩍Ȁ;bcf҆㛬㛰㛴ot;挶ir;櫱Ā;o㛹㛼쀀\uD835\uDD65rk;櫚á㍢rime;怴ƀaip㜏㜒㝤dåቈ΀adempst㜡㝍㝀㝑㝗㝜㝟ngleʀ;dlqr㜰㜱㜶㝀㝂斵own»ᶻeftĀ;e⠀㜾ñम;扜ightĀ;e㊪㝋ñၚot;旬inus;樺lus;樹b;槍ime;樻ezium;揢ƀcht㝲㝽㞁Āry㝷㝻;쀀\uD835\uDCC9;䑆cy;䑛rok;䅧Āio㞋㞎xô᝷headĀlr㞗㞠eftarro÷ࡏightarrow»ཝऀAHabcdfghlmoprstuw㟐㟓㟗㟤㟰㟼㠎㠜㠣㠴㡑㡝㡫㢩㣌㣒㣪㣶ròϭar;楣Ācr㟜㟢ute耻ú䃺òᅐrǣ㟪\x00㟭y;䑞ve;䅭Āiy㟵㟺rc耻û䃻;䑃ƀabh㠃㠆㠋ròᎭlac;䅱aòᏃĀir㠓㠘sht;楾;쀀\uD835\uDD32rave耻ù䃹š㠧㠱rĀlr㠬㠮»ॗ»ႃlk;斀Āct㠹㡍ɯ㠿\x00\x00㡊rnĀ;e㡅㡆挜r»㡆op;挏ri;旸Āal㡖㡚cr;䅫肻¨͉Āgp㡢㡦on;䅳f;쀀\uD835\uDD66̀adhlsuᅋ㡸㡽፲㢑㢠ownáᎳarpoonĀlr㢈㢌efô㠭ighô㠯iƀ;hl㢙㢚㢜䏅»ᏺon»㢚parrows;懈ƀcit㢰㣄㣈ɯ㢶\x00\x00㣁rnĀ;e㢼㢽挝r»㢽op;挎ng;䅯ri;旹cr;쀀\uD835\uDCCAƀdir㣙㣝㣢ot;拰lde;䅩iĀ;f㜰㣨»᠓Āam㣯㣲rò㢨l耻ü䃼angle;榧ހABDacdeflnoprsz㤜㤟㤩㤭㦵㦸㦽㧟㧤㧨㧳㧹㧽㨁㨠ròϷarĀ;v㤦㤧櫨;櫩asèϡĀnr㤲㤷grt;榜΀eknprst㓣㥆㥋㥒㥝㥤㦖appá␕othinçẖƀhir㓫⻈㥙opô⾵Ā;hᎷ㥢ïㆍĀiu㥩㥭gmá㎳Ābp㥲㦄setneqĀ;q㥽㦀쀀⊊︀;쀀⫋︀setneqĀ;q㦏㦒쀀⊋︀;쀀⫌︀Āhr㦛㦟etá㚜iangleĀlr㦪㦯eft»थight»ၑy;䐲ash»ံƀelr㧄㧒㧗ƀ;beⷪ㧋㧏ar;抻q;扚lip;拮Ābt㧜ᑨaòᑩr;쀀\uD835\uDD33tré㦮suĀbp㧯㧱»ജ»൙pf;쀀\uD835\uDD67roð໻tré㦴Ācu㨆㨋r;쀀\uD835\uDCCBĀbp㨐㨘nĀEe㦀㨖»㥾nĀEe㦒㨞»㦐igzag;榚΀cefoprs㨶㨻㩖㩛㩔㩡㩪irc;䅵Ādi㩀㩑Ābg㩅㩉ar;機eĀ;qᗺ㩏;扙erp;愘r;쀀\uD835\uDD34pf;쀀\uD835\uDD68Ā;eᑹ㩦atèᑹcr;쀀\uD835\uDCCCૣណ㪇\x00㪋\x00㪐㪛\x00\x00㪝㪨㪫㪯\x00\x00㫃㫎\x00㫘ៜ៟tré៑r;쀀\uD835\uDD35ĀAa㪔㪗ròσrò৶;䎾ĀAa㪡㪤ròθrò৫að✓is;拻ƀdptឤ㪵㪾Āfl㪺ឩ;쀀\uD835\uDD69imåឲĀAa㫇㫊ròώròਁĀcq㫒ីr;쀀\uD835\uDCCDĀpt៖㫜ré។Ѐacefiosu㫰㫽㬈㬌㬑㬕㬛㬡cĀuy㫶㫻te耻ý䃽;䑏Āiy㬂㬆rc;䅷;䑋n耻¥䂥r;쀀\uD835\uDD36cy;䑗pf;쀀\uD835\uDD6Acr;쀀\uD835\uDCCEĀcm㬦㬩y;䑎l耻ÿ䃿Ԁacdefhiosw㭂㭈㭔㭘㭤㭩㭭㭴㭺㮀cute;䅺Āay㭍㭒ron;䅾;䐷ot;䅼Āet㭝㭡træᕟa;䎶r;쀀\uD835\uDD37cy;䐶grarr;懝pf;쀀\uD835\uDD6Bcr;쀀\uD835\uDCCFĀjn㮅㮇;怍j;怌".split("").map((c) => c.charCodeAt(0)));

// node_modules/entities/lib/esm/generated/decode-data-xml.js
var decode_data_xml_default = new Uint16Array("Ȁaglq\t\x15\x18\x1Bɭ\x0F\x00\x00\x12p;䀦os;䀧t;䀾t;䀼uot;䀢".split("").map((c) => c.charCodeAt(0)));

// node_modules/entities/lib/esm/decode_codepoint.js
var _a3;
var decodeMap = new Map([
  [0, 65533],
  [128, 8364],
  [130, 8218],
  [131, 402],
  [132, 8222],
  [133, 8230],
  [134, 8224],
  [135, 8225],
  [136, 710],
  [137, 8240],
  [138, 352],
  [139, 8249],
  [140, 338],
  [142, 381],
  [145, 8216],
  [146, 8217],
  [147, 8220],
  [148, 8221],
  [149, 8226],
  [150, 8211],
  [151, 8212],
  [152, 732],
  [153, 8482],
  [154, 353],
  [155, 8250],
  [156, 339],
  [158, 382],
  [159, 376]
]);
var fromCodePoint = (_a3 = String.fromCodePoint) !== null && _a3 !== undefined ? _a3 : function(codePoint) {
  let output = "";
  if (codePoint > 65535) {
    codePoint -= 65536;
    output += String.fromCharCode(codePoint >>> 10 & 1023 | 55296);
    codePoint = 56320 | codePoint & 1023;
  }
  output += String.fromCharCode(codePoint);
  return output;
};
function replaceCodePoint(codePoint) {
  var _a;
  if (codePoint >= 55296 && codePoint <= 57343 || codePoint > 1114111) {
    return 65533;
  }
  return (_a = decodeMap.get(codePoint)) !== null && _a !== undefined ? _a : codePoint;
}
// node_modules/entities/lib/esm/decode.js
var CharCodes;
(function(CharCodes) {
  CharCodes[CharCodes["NUM"] = 35] = "NUM";
  CharCodes[CharCodes["SEMI"] = 59] = "SEMI";
  CharCodes[CharCodes["EQUALS"] = 61] = "EQUALS";
  CharCodes[CharCodes["ZERO"] = 48] = "ZERO";
  CharCodes[CharCodes["NINE"] = 57] = "NINE";
  CharCodes[CharCodes["LOWER_A"] = 97] = "LOWER_A";
  CharCodes[CharCodes["LOWER_F"] = 102] = "LOWER_F";
  CharCodes[CharCodes["LOWER_X"] = 120] = "LOWER_X";
  CharCodes[CharCodes["LOWER_Z"] = 122] = "LOWER_Z";
  CharCodes[CharCodes["UPPER_A"] = 65] = "UPPER_A";
  CharCodes[CharCodes["UPPER_F"] = 70] = "UPPER_F";
  CharCodes[CharCodes["UPPER_Z"] = 90] = "UPPER_Z";
})(CharCodes || (CharCodes = {}));
var TO_LOWER_BIT = 32;
var BinTrieFlags;
(function(BinTrieFlags) {
  BinTrieFlags[BinTrieFlags["VALUE_LENGTH"] = 49152] = "VALUE_LENGTH";
  BinTrieFlags[BinTrieFlags["BRANCH_LENGTH"] = 16256] = "BRANCH_LENGTH";
  BinTrieFlags[BinTrieFlags["JUMP_TABLE"] = 127] = "JUMP_TABLE";
})(BinTrieFlags || (BinTrieFlags = {}));
function isNumber(code) {
  return code >= CharCodes.ZERO && code <= CharCodes.NINE;
}
function isHexadecimalCharacter(code) {
  return code >= CharCodes.UPPER_A && code <= CharCodes.UPPER_F || code >= CharCodes.LOWER_A && code <= CharCodes.LOWER_F;
}
function isAsciiAlphaNumeric(code) {
  return code >= CharCodes.UPPER_A && code <= CharCodes.UPPER_Z || code >= CharCodes.LOWER_A && code <= CharCodes.LOWER_Z || isNumber(code);
}
function isEntityInAttributeInvalidEnd(code) {
  return code === CharCodes.EQUALS || isAsciiAlphaNumeric(code);
}
var EntityDecoderState;
(function(EntityDecoderState) {
  EntityDecoderState[EntityDecoderState["EntityStart"] = 0] = "EntityStart";
  EntityDecoderState[EntityDecoderState["NumericStart"] = 1] = "NumericStart";
  EntityDecoderState[EntityDecoderState["NumericDecimal"] = 2] = "NumericDecimal";
  EntityDecoderState[EntityDecoderState["NumericHex"] = 3] = "NumericHex";
  EntityDecoderState[EntityDecoderState["NamedEntity"] = 4] = "NamedEntity";
})(EntityDecoderState || (EntityDecoderState = {}));
var DecodingMode;
(function(DecodingMode) {
  DecodingMode[DecodingMode["Legacy"] = 0] = "Legacy";
  DecodingMode[DecodingMode["Strict"] = 1] = "Strict";
  DecodingMode[DecodingMode["Attribute"] = 2] = "Attribute";
})(DecodingMode || (DecodingMode = {}));

class EntityDecoder {
  constructor(decodeTree, emitCodePoint, errors) {
    this.decodeTree = decodeTree;
    this.emitCodePoint = emitCodePoint;
    this.errors = errors;
    this.state = EntityDecoderState.EntityStart;
    this.consumed = 1;
    this.result = 0;
    this.treeIndex = 0;
    this.excess = 1;
    this.decodeMode = DecodingMode.Strict;
  }
  startEntity(decodeMode) {
    this.decodeMode = decodeMode;
    this.state = EntityDecoderState.EntityStart;
    this.result = 0;
    this.treeIndex = 0;
    this.excess = 1;
    this.consumed = 1;
  }
  write(str, offset) {
    switch (this.state) {
      case EntityDecoderState.EntityStart: {
        if (str.charCodeAt(offset) === CharCodes.NUM) {
          this.state = EntityDecoderState.NumericStart;
          this.consumed += 1;
          return this.stateNumericStart(str, offset + 1);
        }
        this.state = EntityDecoderState.NamedEntity;
        return this.stateNamedEntity(str, offset);
      }
      case EntityDecoderState.NumericStart: {
        return this.stateNumericStart(str, offset);
      }
      case EntityDecoderState.NumericDecimal: {
        return this.stateNumericDecimal(str, offset);
      }
      case EntityDecoderState.NumericHex: {
        return this.stateNumericHex(str, offset);
      }
      case EntityDecoderState.NamedEntity: {
        return this.stateNamedEntity(str, offset);
      }
    }
  }
  stateNumericStart(str, offset) {
    if (offset >= str.length) {
      return -1;
    }
    if ((str.charCodeAt(offset) | TO_LOWER_BIT) === CharCodes.LOWER_X) {
      this.state = EntityDecoderState.NumericHex;
      this.consumed += 1;
      return this.stateNumericHex(str, offset + 1);
    }
    this.state = EntityDecoderState.NumericDecimal;
    return this.stateNumericDecimal(str, offset);
  }
  addToNumericResult(str, start, end, base) {
    if (start !== end) {
      const digitCount = end - start;
      this.result = this.result * Math.pow(base, digitCount) + parseInt(str.substr(start, digitCount), base);
      this.consumed += digitCount;
    }
  }
  stateNumericHex(str, offset) {
    const startIdx = offset;
    while (offset < str.length) {
      const char = str.charCodeAt(offset);
      if (isNumber(char) || isHexadecimalCharacter(char)) {
        offset += 1;
      } else {
        this.addToNumericResult(str, startIdx, offset, 16);
        return this.emitNumericEntity(char, 3);
      }
    }
    this.addToNumericResult(str, startIdx, offset, 16);
    return -1;
  }
  stateNumericDecimal(str, offset) {
    const startIdx = offset;
    while (offset < str.length) {
      const char = str.charCodeAt(offset);
      if (isNumber(char)) {
        offset += 1;
      } else {
        this.addToNumericResult(str, startIdx, offset, 10);
        return this.emitNumericEntity(char, 2);
      }
    }
    this.addToNumericResult(str, startIdx, offset, 10);
    return -1;
  }
  emitNumericEntity(lastCp, expectedLength) {
    var _a;
    if (this.consumed <= expectedLength) {
      (_a = this.errors) === null || _a === undefined || _a.absenceOfDigitsInNumericCharacterReference(this.consumed);
      return 0;
    }
    if (lastCp === CharCodes.SEMI) {
      this.consumed += 1;
    } else if (this.decodeMode === DecodingMode.Strict) {
      return 0;
    }
    this.emitCodePoint(replaceCodePoint(this.result), this.consumed);
    if (this.errors) {
      if (lastCp !== CharCodes.SEMI) {
        this.errors.missingSemicolonAfterCharacterReference();
      }
      this.errors.validateNumericCharacterReference(this.result);
    }
    return this.consumed;
  }
  stateNamedEntity(str, offset) {
    const { decodeTree } = this;
    let current = decodeTree[this.treeIndex];
    let valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
    for (;offset < str.length; offset++, this.excess++) {
      const char = str.charCodeAt(offset);
      this.treeIndex = determineBranch(decodeTree, current, this.treeIndex + Math.max(1, valueLength), char);
      if (this.treeIndex < 0) {
        return this.result === 0 || this.decodeMode === DecodingMode.Attribute && (valueLength === 0 || isEntityInAttributeInvalidEnd(char)) ? 0 : this.emitNotTerminatedNamedEntity();
      }
      current = decodeTree[this.treeIndex];
      valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
      if (valueLength !== 0) {
        if (char === CharCodes.SEMI) {
          return this.emitNamedEntityData(this.treeIndex, valueLength, this.consumed + this.excess);
        }
        if (this.decodeMode !== DecodingMode.Strict) {
          this.result = this.treeIndex;
          this.consumed += this.excess;
          this.excess = 0;
        }
      }
    }
    return -1;
  }
  emitNotTerminatedNamedEntity() {
    var _a;
    const { result, decodeTree } = this;
    const valueLength = (decodeTree[result] & BinTrieFlags.VALUE_LENGTH) >> 14;
    this.emitNamedEntityData(result, valueLength, this.consumed);
    (_a = this.errors) === null || _a === undefined || _a.missingSemicolonAfterCharacterReference();
    return this.consumed;
  }
  emitNamedEntityData(result, valueLength, consumed) {
    const { decodeTree } = this;
    this.emitCodePoint(valueLength === 1 ? decodeTree[result] & ~BinTrieFlags.VALUE_LENGTH : decodeTree[result + 1], consumed);
    if (valueLength === 3) {
      this.emitCodePoint(decodeTree[result + 2], consumed);
    }
    return consumed;
  }
  end() {
    var _a;
    switch (this.state) {
      case EntityDecoderState.NamedEntity: {
        return this.result !== 0 && (this.decodeMode !== DecodingMode.Attribute || this.result === this.treeIndex) ? this.emitNotTerminatedNamedEntity() : 0;
      }
      case EntityDecoderState.NumericDecimal: {
        return this.emitNumericEntity(0, 2);
      }
      case EntityDecoderState.NumericHex: {
        return this.emitNumericEntity(0, 3);
      }
      case EntityDecoderState.NumericStart: {
        (_a = this.errors) === null || _a === undefined || _a.absenceOfDigitsInNumericCharacterReference(this.consumed);
        return 0;
      }
      case EntityDecoderState.EntityStart: {
        return 0;
      }
    }
  }
}
function getDecoder(decodeTree) {
  let ret = "";
  const decoder = new EntityDecoder(decodeTree, (str) => ret += fromCodePoint(str));
  return function decodeWithTrie(str, decodeMode) {
    let lastIndex = 0;
    let offset = 0;
    while ((offset = str.indexOf("&", offset)) >= 0) {
      ret += str.slice(lastIndex, offset);
      decoder.startEntity(decodeMode);
      const len = decoder.write(str, offset + 1);
      if (len < 0) {
        lastIndex = offset + decoder.end();
        break;
      }
      lastIndex = offset + len;
      offset = len === 0 ? lastIndex + 1 : lastIndex;
    }
    const result = ret + str.slice(lastIndex);
    ret = "";
    return result;
  };
}
function determineBranch(decodeTree, current, nodeIdx, char) {
  const branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
  const jumpOffset = current & BinTrieFlags.JUMP_TABLE;
  if (branchCount === 0) {
    return jumpOffset !== 0 && char === jumpOffset ? nodeIdx : -1;
  }
  if (jumpOffset) {
    const value = char - jumpOffset;
    return value < 0 || value >= branchCount ? -1 : decodeTree[nodeIdx + value] - 1;
  }
  let lo = nodeIdx;
  let hi = lo + branchCount - 1;
  while (lo <= hi) {
    const mid = lo + hi >>> 1;
    const midVal = decodeTree[mid];
    if (midVal < char) {
      lo = mid + 1;
    } else if (midVal > char) {
      hi = mid - 1;
    } else {
      return decodeTree[mid + branchCount];
    }
  }
  return -1;
}
var htmlDecoder = getDecoder(decode_data_html_default);
var xmlDecoder = getDecoder(decode_data_xml_default);

// node_modules/htmlparser2/lib/esm/Tokenizer.js
var CharCodes2;
(function(CharCodes) {
  CharCodes[CharCodes["Tab"] = 9] = "Tab";
  CharCodes[CharCodes["NewLine"] = 10] = "NewLine";
  CharCodes[CharCodes["FormFeed"] = 12] = "FormFeed";
  CharCodes[CharCodes["CarriageReturn"] = 13] = "CarriageReturn";
  CharCodes[CharCodes["Space"] = 32] = "Space";
  CharCodes[CharCodes["ExclamationMark"] = 33] = "ExclamationMark";
  CharCodes[CharCodes["Number"] = 35] = "Number";
  CharCodes[CharCodes["Amp"] = 38] = "Amp";
  CharCodes[CharCodes["SingleQuote"] = 39] = "SingleQuote";
  CharCodes[CharCodes["DoubleQuote"] = 34] = "DoubleQuote";
  CharCodes[CharCodes["Dash"] = 45] = "Dash";
  CharCodes[CharCodes["Slash"] = 47] = "Slash";
  CharCodes[CharCodes["Zero"] = 48] = "Zero";
  CharCodes[CharCodes["Nine"] = 57] = "Nine";
  CharCodes[CharCodes["Semi"] = 59] = "Semi";
  CharCodes[CharCodes["Lt"] = 60] = "Lt";
  CharCodes[CharCodes["Eq"] = 61] = "Eq";
  CharCodes[CharCodes["Gt"] = 62] = "Gt";
  CharCodes[CharCodes["Questionmark"] = 63] = "Questionmark";
  CharCodes[CharCodes["UpperA"] = 65] = "UpperA";
  CharCodes[CharCodes["LowerA"] = 97] = "LowerA";
  CharCodes[CharCodes["UpperF"] = 70] = "UpperF";
  CharCodes[CharCodes["LowerF"] = 102] = "LowerF";
  CharCodes[CharCodes["UpperZ"] = 90] = "UpperZ";
  CharCodes[CharCodes["LowerZ"] = 122] = "LowerZ";
  CharCodes[CharCodes["LowerX"] = 120] = "LowerX";
  CharCodes[CharCodes["OpeningSquareBracket"] = 91] = "OpeningSquareBracket";
})(CharCodes2 || (CharCodes2 = {}));
var State;
(function(State) {
  State[State["Text"] = 1] = "Text";
  State[State["BeforeTagName"] = 2] = "BeforeTagName";
  State[State["InTagName"] = 3] = "InTagName";
  State[State["InSelfClosingTag"] = 4] = "InSelfClosingTag";
  State[State["BeforeClosingTagName"] = 5] = "BeforeClosingTagName";
  State[State["InClosingTagName"] = 6] = "InClosingTagName";
  State[State["AfterClosingTagName"] = 7] = "AfterClosingTagName";
  State[State["BeforeAttributeName"] = 8] = "BeforeAttributeName";
  State[State["InAttributeName"] = 9] = "InAttributeName";
  State[State["AfterAttributeName"] = 10] = "AfterAttributeName";
  State[State["BeforeAttributeValue"] = 11] = "BeforeAttributeValue";
  State[State["InAttributeValueDq"] = 12] = "InAttributeValueDq";
  State[State["InAttributeValueSq"] = 13] = "InAttributeValueSq";
  State[State["InAttributeValueNq"] = 14] = "InAttributeValueNq";
  State[State["BeforeDeclaration"] = 15] = "BeforeDeclaration";
  State[State["InDeclaration"] = 16] = "InDeclaration";
  State[State["InProcessingInstruction"] = 17] = "InProcessingInstruction";
  State[State["BeforeComment"] = 18] = "BeforeComment";
  State[State["CDATASequence"] = 19] = "CDATASequence";
  State[State["InSpecialComment"] = 20] = "InSpecialComment";
  State[State["InCommentLike"] = 21] = "InCommentLike";
  State[State["BeforeSpecialS"] = 22] = "BeforeSpecialS";
  State[State["BeforeSpecialT"] = 23] = "BeforeSpecialT";
  State[State["SpecialStartSequence"] = 24] = "SpecialStartSequence";
  State[State["InSpecialTag"] = 25] = "InSpecialTag";
  State[State["InEntity"] = 26] = "InEntity";
})(State || (State = {}));
function isWhitespace(c) {
  return c === CharCodes2.Space || c === CharCodes2.NewLine || c === CharCodes2.Tab || c === CharCodes2.FormFeed || c === CharCodes2.CarriageReturn;
}
function isEndOfTagSection(c) {
  return c === CharCodes2.Slash || c === CharCodes2.Gt || isWhitespace(c);
}
function isASCIIAlpha(c) {
  return c >= CharCodes2.LowerA && c <= CharCodes2.LowerZ || c >= CharCodes2.UpperA && c <= CharCodes2.UpperZ;
}
var QuoteType;
(function(QuoteType) {
  QuoteType[QuoteType["NoValue"] = 0] = "NoValue";
  QuoteType[QuoteType["Unquoted"] = 1] = "Unquoted";
  QuoteType[QuoteType["Single"] = 2] = "Single";
  QuoteType[QuoteType["Double"] = 3] = "Double";
})(QuoteType || (QuoteType = {}));
var Sequences = {
  Cdata: new Uint8Array([67, 68, 65, 84, 65, 91]),
  CdataEnd: new Uint8Array([93, 93, 62]),
  CommentEnd: new Uint8Array([45, 45, 62]),
  ScriptEnd: new Uint8Array([60, 47, 115, 99, 114, 105, 112, 116]),
  StyleEnd: new Uint8Array([60, 47, 115, 116, 121, 108, 101]),
  TitleEnd: new Uint8Array([60, 47, 116, 105, 116, 108, 101]),
  TextareaEnd: new Uint8Array([
    60,
    47,
    116,
    101,
    120,
    116,
    97,
    114,
    101,
    97
  ])
};

class Tokenizer {
  constructor({ xmlMode = false, decodeEntities = true }, cbs) {
    this.cbs = cbs;
    this.state = State.Text;
    this.buffer = "";
    this.sectionStart = 0;
    this.index = 0;
    this.entityStart = 0;
    this.baseState = State.Text;
    this.isSpecial = false;
    this.running = true;
    this.offset = 0;
    this.currentSequence = undefined;
    this.sequenceIndex = 0;
    this.xmlMode = xmlMode;
    this.decodeEntities = decodeEntities;
    this.entityDecoder = new EntityDecoder(xmlMode ? decode_data_xml_default : decode_data_html_default, (cp, consumed) => this.emitCodePoint(cp, consumed));
  }
  reset() {
    this.state = State.Text;
    this.buffer = "";
    this.sectionStart = 0;
    this.index = 0;
    this.baseState = State.Text;
    this.currentSequence = undefined;
    this.running = true;
    this.offset = 0;
  }
  write(chunk) {
    this.offset += this.buffer.length;
    this.buffer = chunk;
    this.parse();
  }
  end() {
    if (this.running)
      this.finish();
  }
  pause() {
    this.running = false;
  }
  resume() {
    this.running = true;
    if (this.index < this.buffer.length + this.offset) {
      this.parse();
    }
  }
  stateText(c) {
    if (c === CharCodes2.Lt || !this.decodeEntities && this.fastForwardTo(CharCodes2.Lt)) {
      if (this.index > this.sectionStart) {
        this.cbs.ontext(this.sectionStart, this.index);
      }
      this.state = State.BeforeTagName;
      this.sectionStart = this.index;
    } else if (this.decodeEntities && c === CharCodes2.Amp) {
      this.startEntity();
    }
  }
  stateSpecialStartSequence(c) {
    const isEnd = this.sequenceIndex === this.currentSequence.length;
    const isMatch = isEnd ? isEndOfTagSection(c) : (c | 32) === this.currentSequence[this.sequenceIndex];
    if (!isMatch) {
      this.isSpecial = false;
    } else if (!isEnd) {
      this.sequenceIndex++;
      return;
    }
    this.sequenceIndex = 0;
    this.state = State.InTagName;
    this.stateInTagName(c);
  }
  stateInSpecialTag(c) {
    if (this.sequenceIndex === this.currentSequence.length) {
      if (c === CharCodes2.Gt || isWhitespace(c)) {
        const endOfText = this.index - this.currentSequence.length;
        if (this.sectionStart < endOfText) {
          const actualIndex = this.index;
          this.index = endOfText;
          this.cbs.ontext(this.sectionStart, endOfText);
          this.index = actualIndex;
        }
        this.isSpecial = false;
        this.sectionStart = endOfText + 2;
        this.stateInClosingTagName(c);
        return;
      }
      this.sequenceIndex = 0;
    }
    if ((c | 32) === this.currentSequence[this.sequenceIndex]) {
      this.sequenceIndex += 1;
    } else if (this.sequenceIndex === 0) {
      if (this.currentSequence === Sequences.TitleEnd) {
        if (this.decodeEntities && c === CharCodes2.Amp) {
          this.startEntity();
        }
      } else if (this.fastForwardTo(CharCodes2.Lt)) {
        this.sequenceIndex = 1;
      }
    } else {
      this.sequenceIndex = Number(c === CharCodes2.Lt);
    }
  }
  stateCDATASequence(c) {
    if (c === Sequences.Cdata[this.sequenceIndex]) {
      if (++this.sequenceIndex === Sequences.Cdata.length) {
        this.state = State.InCommentLike;
        this.currentSequence = Sequences.CdataEnd;
        this.sequenceIndex = 0;
        this.sectionStart = this.index + 1;
      }
    } else {
      this.sequenceIndex = 0;
      this.state = State.InDeclaration;
      this.stateInDeclaration(c);
    }
  }
  fastForwardTo(c) {
    while (++this.index < this.buffer.length + this.offset) {
      if (this.buffer.charCodeAt(this.index - this.offset) === c) {
        return true;
      }
    }
    this.index = this.buffer.length + this.offset - 1;
    return false;
  }
  stateInCommentLike(c) {
    if (c === this.currentSequence[this.sequenceIndex]) {
      if (++this.sequenceIndex === this.currentSequence.length) {
        if (this.currentSequence === Sequences.CdataEnd) {
          this.cbs.oncdata(this.sectionStart, this.index, 2);
        } else {
          this.cbs.oncomment(this.sectionStart, this.index, 2);
        }
        this.sequenceIndex = 0;
        this.sectionStart = this.index + 1;
        this.state = State.Text;
      }
    } else if (this.sequenceIndex === 0) {
      if (this.fastForwardTo(this.currentSequence[0])) {
        this.sequenceIndex = 1;
      }
    } else if (c !== this.currentSequence[this.sequenceIndex - 1]) {
      this.sequenceIndex = 0;
    }
  }
  isTagStartChar(c) {
    return this.xmlMode ? !isEndOfTagSection(c) : isASCIIAlpha(c);
  }
  startSpecial(sequence, offset) {
    this.isSpecial = true;
    this.currentSequence = sequence;
    this.sequenceIndex = offset;
    this.state = State.SpecialStartSequence;
  }
  stateBeforeTagName(c) {
    if (c === CharCodes2.ExclamationMark) {
      this.state = State.BeforeDeclaration;
      this.sectionStart = this.index + 1;
    } else if (c === CharCodes2.Questionmark) {
      this.state = State.InProcessingInstruction;
      this.sectionStart = this.index + 1;
    } else if (this.isTagStartChar(c)) {
      const lower = c | 32;
      this.sectionStart = this.index;
      if (this.xmlMode) {
        this.state = State.InTagName;
      } else if (lower === Sequences.ScriptEnd[2]) {
        this.state = State.BeforeSpecialS;
      } else if (lower === Sequences.TitleEnd[2]) {
        this.state = State.BeforeSpecialT;
      } else {
        this.state = State.InTagName;
      }
    } else if (c === CharCodes2.Slash) {
      this.state = State.BeforeClosingTagName;
    } else {
      this.state = State.Text;
      this.stateText(c);
    }
  }
  stateInTagName(c) {
    if (isEndOfTagSection(c)) {
      this.cbs.onopentagname(this.sectionStart, this.index);
      this.sectionStart = -1;
      this.state = State.BeforeAttributeName;
      this.stateBeforeAttributeName(c);
    }
  }
  stateBeforeClosingTagName(c) {
    if (isWhitespace(c)) {} else if (c === CharCodes2.Gt) {
      this.state = State.Text;
    } else {
      this.state = this.isTagStartChar(c) ? State.InClosingTagName : State.InSpecialComment;
      this.sectionStart = this.index;
    }
  }
  stateInClosingTagName(c) {
    if (c === CharCodes2.Gt || isWhitespace(c)) {
      this.cbs.onclosetag(this.sectionStart, this.index);
      this.sectionStart = -1;
      this.state = State.AfterClosingTagName;
      this.stateAfterClosingTagName(c);
    }
  }
  stateAfterClosingTagName(c) {
    if (c === CharCodes2.Gt || this.fastForwardTo(CharCodes2.Gt)) {
      this.state = State.Text;
      this.sectionStart = this.index + 1;
    }
  }
  stateBeforeAttributeName(c) {
    if (c === CharCodes2.Gt) {
      this.cbs.onopentagend(this.index);
      if (this.isSpecial) {
        this.state = State.InSpecialTag;
        this.sequenceIndex = 0;
      } else {
        this.state = State.Text;
      }
      this.sectionStart = this.index + 1;
    } else if (c === CharCodes2.Slash) {
      this.state = State.InSelfClosingTag;
    } else if (!isWhitespace(c)) {
      this.state = State.InAttributeName;
      this.sectionStart = this.index;
    }
  }
  stateInSelfClosingTag(c) {
    if (c === CharCodes2.Gt) {
      this.cbs.onselfclosingtag(this.index);
      this.state = State.Text;
      this.sectionStart = this.index + 1;
      this.isSpecial = false;
    } else if (!isWhitespace(c)) {
      this.state = State.BeforeAttributeName;
      this.stateBeforeAttributeName(c);
    }
  }
  stateInAttributeName(c) {
    if (c === CharCodes2.Eq || isEndOfTagSection(c)) {
      this.cbs.onattribname(this.sectionStart, this.index);
      this.sectionStart = this.index;
      this.state = State.AfterAttributeName;
      this.stateAfterAttributeName(c);
    }
  }
  stateAfterAttributeName(c) {
    if (c === CharCodes2.Eq) {
      this.state = State.BeforeAttributeValue;
    } else if (c === CharCodes2.Slash || c === CharCodes2.Gt) {
      this.cbs.onattribend(QuoteType.NoValue, this.sectionStart);
      this.sectionStart = -1;
      this.state = State.BeforeAttributeName;
      this.stateBeforeAttributeName(c);
    } else if (!isWhitespace(c)) {
      this.cbs.onattribend(QuoteType.NoValue, this.sectionStart);
      this.state = State.InAttributeName;
      this.sectionStart = this.index;
    }
  }
  stateBeforeAttributeValue(c) {
    if (c === CharCodes2.DoubleQuote) {
      this.state = State.InAttributeValueDq;
      this.sectionStart = this.index + 1;
    } else if (c === CharCodes2.SingleQuote) {
      this.state = State.InAttributeValueSq;
      this.sectionStart = this.index + 1;
    } else if (!isWhitespace(c)) {
      this.sectionStart = this.index;
      this.state = State.InAttributeValueNq;
      this.stateInAttributeValueNoQuotes(c);
    }
  }
  handleInAttributeValue(c, quote) {
    if (c === quote || !this.decodeEntities && this.fastForwardTo(quote)) {
      this.cbs.onattribdata(this.sectionStart, this.index);
      this.sectionStart = -1;
      this.cbs.onattribend(quote === CharCodes2.DoubleQuote ? QuoteType.Double : QuoteType.Single, this.index + 1);
      this.state = State.BeforeAttributeName;
    } else if (this.decodeEntities && c === CharCodes2.Amp) {
      this.startEntity();
    }
  }
  stateInAttributeValueDoubleQuotes(c) {
    this.handleInAttributeValue(c, CharCodes2.DoubleQuote);
  }
  stateInAttributeValueSingleQuotes(c) {
    this.handleInAttributeValue(c, CharCodes2.SingleQuote);
  }
  stateInAttributeValueNoQuotes(c) {
    if (isWhitespace(c) || c === CharCodes2.Gt) {
      this.cbs.onattribdata(this.sectionStart, this.index);
      this.sectionStart = -1;
      this.cbs.onattribend(QuoteType.Unquoted, this.index);
      this.state = State.BeforeAttributeName;
      this.stateBeforeAttributeName(c);
    } else if (this.decodeEntities && c === CharCodes2.Amp) {
      this.startEntity();
    }
  }
  stateBeforeDeclaration(c) {
    if (c === CharCodes2.OpeningSquareBracket) {
      this.state = State.CDATASequence;
      this.sequenceIndex = 0;
    } else {
      this.state = c === CharCodes2.Dash ? State.BeforeComment : State.InDeclaration;
    }
  }
  stateInDeclaration(c) {
    if (c === CharCodes2.Gt || this.fastForwardTo(CharCodes2.Gt)) {
      this.cbs.ondeclaration(this.sectionStart, this.index);
      this.state = State.Text;
      this.sectionStart = this.index + 1;
    }
  }
  stateInProcessingInstruction(c) {
    if (c === CharCodes2.Gt || this.fastForwardTo(CharCodes2.Gt)) {
      this.cbs.onprocessinginstruction(this.sectionStart, this.index);
      this.state = State.Text;
      this.sectionStart = this.index + 1;
    }
  }
  stateBeforeComment(c) {
    if (c === CharCodes2.Dash) {
      this.state = State.InCommentLike;
      this.currentSequence = Sequences.CommentEnd;
      this.sequenceIndex = 2;
      this.sectionStart = this.index + 1;
    } else {
      this.state = State.InDeclaration;
    }
  }
  stateInSpecialComment(c) {
    if (c === CharCodes2.Gt || this.fastForwardTo(CharCodes2.Gt)) {
      this.cbs.oncomment(this.sectionStart, this.index, 0);
      this.state = State.Text;
      this.sectionStart = this.index + 1;
    }
  }
  stateBeforeSpecialS(c) {
    const lower = c | 32;
    if (lower === Sequences.ScriptEnd[3]) {
      this.startSpecial(Sequences.ScriptEnd, 4);
    } else if (lower === Sequences.StyleEnd[3]) {
      this.startSpecial(Sequences.StyleEnd, 4);
    } else {
      this.state = State.InTagName;
      this.stateInTagName(c);
    }
  }
  stateBeforeSpecialT(c) {
    const lower = c | 32;
    if (lower === Sequences.TitleEnd[3]) {
      this.startSpecial(Sequences.TitleEnd, 4);
    } else if (lower === Sequences.TextareaEnd[3]) {
      this.startSpecial(Sequences.TextareaEnd, 4);
    } else {
      this.state = State.InTagName;
      this.stateInTagName(c);
    }
  }
  startEntity() {
    this.baseState = this.state;
    this.state = State.InEntity;
    this.entityStart = this.index;
    this.entityDecoder.startEntity(this.xmlMode ? DecodingMode.Strict : this.baseState === State.Text || this.baseState === State.InSpecialTag ? DecodingMode.Legacy : DecodingMode.Attribute);
  }
  stateInEntity() {
    const length = this.entityDecoder.write(this.buffer, this.index - this.offset);
    if (length >= 0) {
      this.state = this.baseState;
      if (length === 0) {
        this.index = this.entityStart;
      }
    } else {
      this.index = this.offset + this.buffer.length - 1;
    }
  }
  cleanup() {
    if (this.running && this.sectionStart !== this.index) {
      if (this.state === State.Text || this.state === State.InSpecialTag && this.sequenceIndex === 0) {
        this.cbs.ontext(this.sectionStart, this.index);
        this.sectionStart = this.index;
      } else if (this.state === State.InAttributeValueDq || this.state === State.InAttributeValueSq || this.state === State.InAttributeValueNq) {
        this.cbs.onattribdata(this.sectionStart, this.index);
        this.sectionStart = this.index;
      }
    }
  }
  shouldContinue() {
    return this.index < this.buffer.length + this.offset && this.running;
  }
  parse() {
    while (this.shouldContinue()) {
      const c = this.buffer.charCodeAt(this.index - this.offset);
      switch (this.state) {
        case State.Text: {
          this.stateText(c);
          break;
        }
        case State.SpecialStartSequence: {
          this.stateSpecialStartSequence(c);
          break;
        }
        case State.InSpecialTag: {
          this.stateInSpecialTag(c);
          break;
        }
        case State.CDATASequence: {
          this.stateCDATASequence(c);
          break;
        }
        case State.InAttributeValueDq: {
          this.stateInAttributeValueDoubleQuotes(c);
          break;
        }
        case State.InAttributeName: {
          this.stateInAttributeName(c);
          break;
        }
        case State.InCommentLike: {
          this.stateInCommentLike(c);
          break;
        }
        case State.InSpecialComment: {
          this.stateInSpecialComment(c);
          break;
        }
        case State.BeforeAttributeName: {
          this.stateBeforeAttributeName(c);
          break;
        }
        case State.InTagName: {
          this.stateInTagName(c);
          break;
        }
        case State.InClosingTagName: {
          this.stateInClosingTagName(c);
          break;
        }
        case State.BeforeTagName: {
          this.stateBeforeTagName(c);
          break;
        }
        case State.AfterAttributeName: {
          this.stateAfterAttributeName(c);
          break;
        }
        case State.InAttributeValueSq: {
          this.stateInAttributeValueSingleQuotes(c);
          break;
        }
        case State.BeforeAttributeValue: {
          this.stateBeforeAttributeValue(c);
          break;
        }
        case State.BeforeClosingTagName: {
          this.stateBeforeClosingTagName(c);
          break;
        }
        case State.AfterClosingTagName: {
          this.stateAfterClosingTagName(c);
          break;
        }
        case State.BeforeSpecialS: {
          this.stateBeforeSpecialS(c);
          break;
        }
        case State.BeforeSpecialT: {
          this.stateBeforeSpecialT(c);
          break;
        }
        case State.InAttributeValueNq: {
          this.stateInAttributeValueNoQuotes(c);
          break;
        }
        case State.InSelfClosingTag: {
          this.stateInSelfClosingTag(c);
          break;
        }
        case State.InDeclaration: {
          this.stateInDeclaration(c);
          break;
        }
        case State.BeforeDeclaration: {
          this.stateBeforeDeclaration(c);
          break;
        }
        case State.BeforeComment: {
          this.stateBeforeComment(c);
          break;
        }
        case State.InProcessingInstruction: {
          this.stateInProcessingInstruction(c);
          break;
        }
        case State.InEntity: {
          this.stateInEntity();
          break;
        }
      }
      this.index++;
    }
    this.cleanup();
  }
  finish() {
    if (this.state === State.InEntity) {
      this.entityDecoder.end();
      this.state = this.baseState;
    }
    this.handleTrailingData();
    this.cbs.onend();
  }
  handleTrailingData() {
    const endIndex = this.buffer.length + this.offset;
    if (this.sectionStart >= endIndex) {
      return;
    }
    if (this.state === State.InCommentLike) {
      if (this.currentSequence === Sequences.CdataEnd) {
        this.cbs.oncdata(this.sectionStart, endIndex, 0);
      } else {
        this.cbs.oncomment(this.sectionStart, endIndex, 0);
      }
    } else if (this.state === State.InTagName || this.state === State.BeforeAttributeName || this.state === State.BeforeAttributeValue || this.state === State.AfterAttributeName || this.state === State.InAttributeName || this.state === State.InAttributeValueSq || this.state === State.InAttributeValueDq || this.state === State.InAttributeValueNq || this.state === State.InClosingTagName) {} else {
      this.cbs.ontext(this.sectionStart, endIndex);
    }
  }
  emitCodePoint(cp, consumed) {
    if (this.baseState !== State.Text && this.baseState !== State.InSpecialTag) {
      if (this.sectionStart < this.entityStart) {
        this.cbs.onattribdata(this.sectionStart, this.entityStart);
      }
      this.sectionStart = this.entityStart + consumed;
      this.index = this.sectionStart - 1;
      this.cbs.onattribentity(cp);
    } else {
      if (this.sectionStart < this.entityStart) {
        this.cbs.ontext(this.sectionStart, this.entityStart);
      }
      this.sectionStart = this.entityStart + consumed;
      this.index = this.sectionStart - 1;
      this.cbs.ontextentity(cp, this.sectionStart);
    }
  }
}

// node_modules/htmlparser2/lib/esm/Parser.js
var formTags = new Set([
  "input",
  "option",
  "optgroup",
  "select",
  "button",
  "datalist",
  "textarea"
]);
var pTag = new Set(["p"]);
var tableSectionTags = new Set(["thead", "tbody"]);
var ddtTags = new Set(["dd", "dt"]);
var rtpTags = new Set(["rt", "rp"]);
var openImpliesClose = new Map([
  ["tr", new Set(["tr", "th", "td"])],
  ["th", new Set(["th"])],
  ["td", new Set(["thead", "th", "td"])],
  ["body", new Set(["head", "link", "script"])],
  ["li", new Set(["li"])],
  ["p", pTag],
  ["h1", pTag],
  ["h2", pTag],
  ["h3", pTag],
  ["h4", pTag],
  ["h5", pTag],
  ["h6", pTag],
  ["select", formTags],
  ["input", formTags],
  ["output", formTags],
  ["button", formTags],
  ["datalist", formTags],
  ["textarea", formTags],
  ["option", new Set(["option"])],
  ["optgroup", new Set(["optgroup", "option"])],
  ["dd", ddtTags],
  ["dt", ddtTags],
  ["address", pTag],
  ["article", pTag],
  ["aside", pTag],
  ["blockquote", pTag],
  ["details", pTag],
  ["div", pTag],
  ["dl", pTag],
  ["fieldset", pTag],
  ["figcaption", pTag],
  ["figure", pTag],
  ["footer", pTag],
  ["form", pTag],
  ["header", pTag],
  ["hr", pTag],
  ["main", pTag],
  ["nav", pTag],
  ["ol", pTag],
  ["pre", pTag],
  ["section", pTag],
  ["table", pTag],
  ["ul", pTag],
  ["rt", rtpTags],
  ["rp", rtpTags],
  ["tbody", tableSectionTags],
  ["tfoot", tableSectionTags]
]);
var voidElements = new Set([
  "area",
  "base",
  "basefont",
  "br",
  "col",
  "command",
  "embed",
  "frame",
  "hr",
  "img",
  "input",
  "isindex",
  "keygen",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);
var foreignContextElements = new Set(["math", "svg"]);
var htmlIntegrationElements = new Set([
  "mi",
  "mo",
  "mn",
  "ms",
  "mtext",
  "annotation-xml",
  "foreignobject",
  "desc",
  "title"
]);
var reNameEnd = /\s|\//;

class Parser {
  constructor(cbs, options = {}) {
    var _a, _b, _c, _d, _e, _f;
    this.options = options;
    this.startIndex = 0;
    this.endIndex = 0;
    this.openTagStart = 0;
    this.tagname = "";
    this.attribname = "";
    this.attribvalue = "";
    this.attribs = null;
    this.stack = [];
    this.buffers = [];
    this.bufferOffset = 0;
    this.writeIndex = 0;
    this.ended = false;
    this.cbs = cbs !== null && cbs !== undefined ? cbs : {};
    this.htmlMode = !this.options.xmlMode;
    this.lowerCaseTagNames = (_a = options.lowerCaseTags) !== null && _a !== undefined ? _a : this.htmlMode;
    this.lowerCaseAttributeNames = (_b = options.lowerCaseAttributeNames) !== null && _b !== undefined ? _b : this.htmlMode;
    this.recognizeSelfClosing = (_c = options.recognizeSelfClosing) !== null && _c !== undefined ? _c : !this.htmlMode;
    this.tokenizer = new ((_d = options.Tokenizer) !== null && _d !== undefined ? _d : Tokenizer)(this.options, this);
    this.foreignContext = [!this.htmlMode];
    (_f = (_e = this.cbs).onparserinit) === null || _f === undefined || _f.call(_e, this);
  }
  ontext(start, endIndex) {
    var _a, _b;
    const data = this.getSlice(start, endIndex);
    this.endIndex = endIndex - 1;
    (_b = (_a = this.cbs).ontext) === null || _b === undefined || _b.call(_a, data);
    this.startIndex = endIndex;
  }
  ontextentity(cp, endIndex) {
    var _a, _b;
    this.endIndex = endIndex - 1;
    (_b = (_a = this.cbs).ontext) === null || _b === undefined || _b.call(_a, fromCodePoint(cp));
    this.startIndex = endIndex;
  }
  isVoidElement(name) {
    return this.htmlMode && voidElements.has(name);
  }
  onopentagname(start, endIndex) {
    this.endIndex = endIndex;
    let name = this.getSlice(start, endIndex);
    if (this.lowerCaseTagNames) {
      name = name.toLowerCase();
    }
    this.emitOpenTag(name);
  }
  emitOpenTag(name) {
    var _a, _b, _c, _d;
    this.openTagStart = this.startIndex;
    this.tagname = name;
    const impliesClose = this.htmlMode && openImpliesClose.get(name);
    if (impliesClose) {
      while (this.stack.length > 0 && impliesClose.has(this.stack[0])) {
        const element = this.stack.shift();
        (_b = (_a = this.cbs).onclosetag) === null || _b === undefined || _b.call(_a, element, true);
      }
    }
    if (!this.isVoidElement(name)) {
      this.stack.unshift(name);
      if (this.htmlMode) {
        if (foreignContextElements.has(name)) {
          this.foreignContext.unshift(true);
        } else if (htmlIntegrationElements.has(name)) {
          this.foreignContext.unshift(false);
        }
      }
    }
    (_d = (_c = this.cbs).onopentagname) === null || _d === undefined || _d.call(_c, name);
    if (this.cbs.onopentag)
      this.attribs = {};
  }
  endOpenTag(isImplied) {
    var _a, _b;
    this.startIndex = this.openTagStart;
    if (this.attribs) {
      (_b = (_a = this.cbs).onopentag) === null || _b === undefined || _b.call(_a, this.tagname, this.attribs, isImplied);
      this.attribs = null;
    }
    if (this.cbs.onclosetag && this.isVoidElement(this.tagname)) {
      this.cbs.onclosetag(this.tagname, true);
    }
    this.tagname = "";
  }
  onopentagend(endIndex) {
    this.endIndex = endIndex;
    this.endOpenTag(false);
    this.startIndex = endIndex + 1;
  }
  onclosetag(start, endIndex) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    this.endIndex = endIndex;
    let name = this.getSlice(start, endIndex);
    if (this.lowerCaseTagNames) {
      name = name.toLowerCase();
    }
    if (this.htmlMode && (foreignContextElements.has(name) || htmlIntegrationElements.has(name))) {
      this.foreignContext.shift();
    }
    if (!this.isVoidElement(name)) {
      const pos = this.stack.indexOf(name);
      if (pos !== -1) {
        for (let index = 0;index <= pos; index++) {
          const element = this.stack.shift();
          (_b = (_a = this.cbs).onclosetag) === null || _b === undefined || _b.call(_a, element, index !== pos);
        }
      } else if (this.htmlMode && name === "p") {
        this.emitOpenTag("p");
        this.closeCurrentTag(true);
      }
    } else if (this.htmlMode && name === "br") {
      (_d = (_c = this.cbs).onopentagname) === null || _d === undefined || _d.call(_c, "br");
      (_f = (_e = this.cbs).onopentag) === null || _f === undefined || _f.call(_e, "br", {}, true);
      (_h = (_g = this.cbs).onclosetag) === null || _h === undefined || _h.call(_g, "br", false);
    }
    this.startIndex = endIndex + 1;
  }
  onselfclosingtag(endIndex) {
    this.endIndex = endIndex;
    if (this.recognizeSelfClosing || this.foreignContext[0]) {
      this.closeCurrentTag(false);
      this.startIndex = endIndex + 1;
    } else {
      this.onopentagend(endIndex);
    }
  }
  closeCurrentTag(isOpenImplied) {
    var _a, _b;
    const name = this.tagname;
    this.endOpenTag(isOpenImplied);
    if (this.stack[0] === name) {
      (_b = (_a = this.cbs).onclosetag) === null || _b === undefined || _b.call(_a, name, !isOpenImplied);
      this.stack.shift();
    }
  }
  onattribname(start, endIndex) {
    this.startIndex = start;
    const name = this.getSlice(start, endIndex);
    this.attribname = this.lowerCaseAttributeNames ? name.toLowerCase() : name;
  }
  onattribdata(start, endIndex) {
    this.attribvalue += this.getSlice(start, endIndex);
  }
  onattribentity(cp) {
    this.attribvalue += fromCodePoint(cp);
  }
  onattribend(quote, endIndex) {
    var _a, _b;
    this.endIndex = endIndex;
    (_b = (_a = this.cbs).onattribute) === null || _b === undefined || _b.call(_a, this.attribname, this.attribvalue, quote === QuoteType.Double ? '"' : quote === QuoteType.Single ? "'" : quote === QuoteType.NoValue ? undefined : null);
    if (this.attribs && !Object.prototype.hasOwnProperty.call(this.attribs, this.attribname)) {
      this.attribs[this.attribname] = this.attribvalue;
    }
    this.attribvalue = "";
  }
  getInstructionName(value) {
    const index = value.search(reNameEnd);
    let name = index < 0 ? value : value.substr(0, index);
    if (this.lowerCaseTagNames) {
      name = name.toLowerCase();
    }
    return name;
  }
  ondeclaration(start, endIndex) {
    this.endIndex = endIndex;
    const value = this.getSlice(start, endIndex);
    if (this.cbs.onprocessinginstruction) {
      const name = this.getInstructionName(value);
      this.cbs.onprocessinginstruction(`!${name}`, `!${value}`);
    }
    this.startIndex = endIndex + 1;
  }
  onprocessinginstruction(start, endIndex) {
    this.endIndex = endIndex;
    const value = this.getSlice(start, endIndex);
    if (this.cbs.onprocessinginstruction) {
      const name = this.getInstructionName(value);
      this.cbs.onprocessinginstruction(`?${name}`, `?${value}`);
    }
    this.startIndex = endIndex + 1;
  }
  oncomment(start, endIndex, offset) {
    var _a, _b, _c, _d;
    this.endIndex = endIndex;
    (_b = (_a = this.cbs).oncomment) === null || _b === undefined || _b.call(_a, this.getSlice(start, endIndex - offset));
    (_d = (_c = this.cbs).oncommentend) === null || _d === undefined || _d.call(_c);
    this.startIndex = endIndex + 1;
  }
  oncdata(start, endIndex, offset) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    this.endIndex = endIndex;
    const value = this.getSlice(start, endIndex - offset);
    if (!this.htmlMode || this.options.recognizeCDATA) {
      (_b = (_a = this.cbs).oncdatastart) === null || _b === undefined || _b.call(_a);
      (_d = (_c = this.cbs).ontext) === null || _d === undefined || _d.call(_c, value);
      (_f = (_e = this.cbs).oncdataend) === null || _f === undefined || _f.call(_e);
    } else {
      (_h = (_g = this.cbs).oncomment) === null || _h === undefined || _h.call(_g, `[CDATA[${value}]]`);
      (_k = (_j = this.cbs).oncommentend) === null || _k === undefined || _k.call(_j);
    }
    this.startIndex = endIndex + 1;
  }
  onend() {
    var _a, _b;
    if (this.cbs.onclosetag) {
      this.endIndex = this.startIndex;
      for (let index = 0;index < this.stack.length; index++) {
        this.cbs.onclosetag(this.stack[index], true);
      }
    }
    (_b = (_a = this.cbs).onend) === null || _b === undefined || _b.call(_a);
  }
  reset() {
    var _a, _b, _c, _d;
    (_b = (_a = this.cbs).onreset) === null || _b === undefined || _b.call(_a);
    this.tokenizer.reset();
    this.tagname = "";
    this.attribname = "";
    this.attribs = null;
    this.stack.length = 0;
    this.startIndex = 0;
    this.endIndex = 0;
    (_d = (_c = this.cbs).onparserinit) === null || _d === undefined || _d.call(_c, this);
    this.buffers.length = 0;
    this.foreignContext.length = 0;
    this.foreignContext.unshift(!this.htmlMode);
    this.bufferOffset = 0;
    this.writeIndex = 0;
    this.ended = false;
  }
  parseComplete(data) {
    this.reset();
    this.end(data);
  }
  getSlice(start, end) {
    while (start - this.bufferOffset >= this.buffers[0].length) {
      this.shiftBuffer();
    }
    let slice = this.buffers[0].slice(start - this.bufferOffset, end - this.bufferOffset);
    while (end - this.bufferOffset > this.buffers[0].length) {
      this.shiftBuffer();
      slice += this.buffers[0].slice(0, end - this.bufferOffset);
    }
    return slice;
  }
  shiftBuffer() {
    this.bufferOffset += this.buffers[0].length;
    this.writeIndex--;
    this.buffers.shift();
  }
  write(chunk) {
    var _a, _b;
    if (this.ended) {
      (_b = (_a = this.cbs).onerror) === null || _b === undefined || _b.call(_a, new Error(".write() after done!"));
      return;
    }
    this.buffers.push(chunk);
    if (this.tokenizer.running) {
      this.tokenizer.write(chunk);
      this.writeIndex++;
    }
  }
  end(chunk) {
    var _a, _b;
    if (this.ended) {
      (_b = (_a = this.cbs).onerror) === null || _b === undefined || _b.call(_a, new Error(".end() after done!"));
      return;
    }
    if (chunk)
      this.write(chunk);
    this.ended = true;
    this.tokenizer.end();
  }
  pause() {
    this.tokenizer.pause();
  }
  resume() {
    this.tokenizer.resume();
    while (this.tokenizer.running && this.writeIndex < this.buffers.length) {
      this.tokenizer.write(this.buffers[this.writeIndex++]);
    }
    if (this.ended)
      this.tokenizer.end();
  }
  parseChunk(chunk) {
    this.write(chunk);
  }
  done(chunk) {
    this.end(chunk);
  }
}
// node_modules/domelementtype/lib/esm/index.js
var ElementType;
(function(ElementType) {
  ElementType["Root"] = "root";
  ElementType["Text"] = "text";
  ElementType["Directive"] = "directive";
  ElementType["Comment"] = "comment";
  ElementType["Script"] = "script";
  ElementType["Style"] = "style";
  ElementType["Tag"] = "tag";
  ElementType["CDATA"] = "cdata";
  ElementType["Doctype"] = "doctype";
})(ElementType || (ElementType = {}));
function isTag(elem) {
  return elem.type === ElementType.Tag || elem.type === ElementType.Script || elem.type === ElementType.Style;
}
var Root = ElementType.Root;
var Text = ElementType.Text;
var Directive = ElementType.Directive;
var Comment = ElementType.Comment;
var Script = ElementType.Script;
var Style = ElementType.Style;
var Tag = ElementType.Tag;
var CDATA = ElementType.CDATA;
var Doctype = ElementType.Doctype;

// node_modules/domhandler/lib/esm/node.js
class Node {
  constructor() {
    this.parent = null;
    this.prev = null;
    this.next = null;
    this.startIndex = null;
    this.endIndex = null;
  }
  get parentNode() {
    return this.parent;
  }
  set parentNode(parent) {
    this.parent = parent;
  }
  get previousSibling() {
    return this.prev;
  }
  set previousSibling(prev) {
    this.prev = prev;
  }
  get nextSibling() {
    return this.next;
  }
  set nextSibling(next) {
    this.next = next;
  }
  cloneNode(recursive = false) {
    return cloneNode(this, recursive);
  }
}

class DataNode extends Node {
  constructor(data) {
    super();
    this.data = data;
  }
  get nodeValue() {
    return this.data;
  }
  set nodeValue(data) {
    this.data = data;
  }
}

class Text2 extends DataNode {
  constructor() {
    super(...arguments);
    this.type = ElementType.Text;
  }
  get nodeType() {
    return 3;
  }
}

class Comment2 extends DataNode {
  constructor() {
    super(...arguments);
    this.type = ElementType.Comment;
  }
  get nodeType() {
    return 8;
  }
}

class ProcessingInstruction extends DataNode {
  constructor(name, data) {
    super(data);
    this.name = name;
    this.type = ElementType.Directive;
  }
  get nodeType() {
    return 1;
  }
}

class NodeWithChildren extends Node {
  constructor(children) {
    super();
    this.children = children;
  }
  get firstChild() {
    var _a;
    return (_a = this.children[0]) !== null && _a !== undefined ? _a : null;
  }
  get lastChild() {
    return this.children.length > 0 ? this.children[this.children.length - 1] : null;
  }
  get childNodes() {
    return this.children;
  }
  set childNodes(children) {
    this.children = children;
  }
}

class CDATA2 extends NodeWithChildren {
  constructor() {
    super(...arguments);
    this.type = ElementType.CDATA;
  }
  get nodeType() {
    return 4;
  }
}

class Document extends NodeWithChildren {
  constructor() {
    super(...arguments);
    this.type = ElementType.Root;
  }
  get nodeType() {
    return 9;
  }
}

class Element extends NodeWithChildren {
  constructor(name, attribs, children = [], type = name === "script" ? ElementType.Script : name === "style" ? ElementType.Style : ElementType.Tag) {
    super(children);
    this.name = name;
    this.attribs = attribs;
    this.type = type;
  }
  get nodeType() {
    return 1;
  }
  get tagName() {
    return this.name;
  }
  set tagName(name) {
    this.name = name;
  }
  get attributes() {
    return Object.keys(this.attribs).map((name) => {
      var _a, _b;
      return {
        name,
        value: this.attribs[name],
        namespace: (_a = this["x-attribsNamespace"]) === null || _a === undefined ? undefined : _a[name],
        prefix: (_b = this["x-attribsPrefix"]) === null || _b === undefined ? undefined : _b[name]
      };
    });
  }
}
function isTag2(node) {
  return isTag(node);
}
function isCDATA(node) {
  return node.type === ElementType.CDATA;
}
function isText(node) {
  return node.type === ElementType.Text;
}
function isComment(node) {
  return node.type === ElementType.Comment;
}
function isDirective(node) {
  return node.type === ElementType.Directive;
}
function isDocument(node) {
  return node.type === ElementType.Root;
}
function cloneNode(node, recursive = false) {
  let result;
  if (isText(node)) {
    result = new Text2(node.data);
  } else if (isComment(node)) {
    result = new Comment2(node.data);
  } else if (isTag2(node)) {
    const children = recursive ? cloneChildren(node.children) : [];
    const clone = new Element(node.name, { ...node.attribs }, children);
    children.forEach((child) => child.parent = clone);
    if (node.namespace != null) {
      clone.namespace = node.namespace;
    }
    if (node["x-attribsNamespace"]) {
      clone["x-attribsNamespace"] = { ...node["x-attribsNamespace"] };
    }
    if (node["x-attribsPrefix"]) {
      clone["x-attribsPrefix"] = { ...node["x-attribsPrefix"] };
    }
    result = clone;
  } else if (isCDATA(node)) {
    const children = recursive ? cloneChildren(node.children) : [];
    const clone = new CDATA2(children);
    children.forEach((child) => child.parent = clone);
    result = clone;
  } else if (isDocument(node)) {
    const children = recursive ? cloneChildren(node.children) : [];
    const clone = new Document(children);
    children.forEach((child) => child.parent = clone);
    if (node["x-mode"]) {
      clone["x-mode"] = node["x-mode"];
    }
    result = clone;
  } else if (isDirective(node)) {
    const instruction = new ProcessingInstruction(node.name, node.data);
    if (node["x-name"] != null) {
      instruction["x-name"] = node["x-name"];
      instruction["x-publicId"] = node["x-publicId"];
      instruction["x-systemId"] = node["x-systemId"];
    }
    result = instruction;
  } else {
    throw new Error(`Not implemented yet: ${node.type}`);
  }
  result.startIndex = node.startIndex;
  result.endIndex = node.endIndex;
  if (node.sourceCodeLocation != null) {
    result.sourceCodeLocation = node.sourceCodeLocation;
  }
  return result;
}
function cloneChildren(childs) {
  const children = childs.map((child) => cloneNode(child, true));
  for (let i = 1;i < children.length; i++) {
    children[i].prev = children[i - 1];
    children[i - 1].next = children[i];
  }
  return children;
}

// node_modules/domhandler/lib/esm/index.js
var defaultOpts = {
  withStartIndices: false,
  withEndIndices: false,
  xmlMode: false
};

class DomHandler {
  constructor(callback, options, elementCB) {
    this.dom = [];
    this.root = new Document(this.dom);
    this.done = false;
    this.tagStack = [this.root];
    this.lastNode = null;
    this.parser = null;
    if (typeof options === "function") {
      elementCB = options;
      options = defaultOpts;
    }
    if (typeof callback === "object") {
      options = callback;
      callback = undefined;
    }
    this.callback = callback !== null && callback !== undefined ? callback : null;
    this.options = options !== null && options !== undefined ? options : defaultOpts;
    this.elementCB = elementCB !== null && elementCB !== undefined ? elementCB : null;
  }
  onparserinit(parser) {
    this.parser = parser;
  }
  onreset() {
    this.dom = [];
    this.root = new Document(this.dom);
    this.done = false;
    this.tagStack = [this.root];
    this.lastNode = null;
    this.parser = null;
  }
  onend() {
    if (this.done)
      return;
    this.done = true;
    this.parser = null;
    this.handleCallback(null);
  }
  onerror(error) {
    this.handleCallback(error);
  }
  onclosetag() {
    this.lastNode = null;
    const elem = this.tagStack.pop();
    if (this.options.withEndIndices) {
      elem.endIndex = this.parser.endIndex;
    }
    if (this.elementCB)
      this.elementCB(elem);
  }
  onopentag(name, attribs) {
    const type = this.options.xmlMode ? ElementType.Tag : undefined;
    const element = new Element(name, attribs, undefined, type);
    this.addNode(element);
    this.tagStack.push(element);
  }
  ontext(data) {
    const { lastNode } = this;
    if (lastNode && lastNode.type === ElementType.Text) {
      lastNode.data += data;
      if (this.options.withEndIndices) {
        lastNode.endIndex = this.parser.endIndex;
      }
    } else {
      const node = new Text2(data);
      this.addNode(node);
      this.lastNode = node;
    }
  }
  oncomment(data) {
    if (this.lastNode && this.lastNode.type === ElementType.Comment) {
      this.lastNode.data += data;
      return;
    }
    const node = new Comment2(data);
    this.addNode(node);
    this.lastNode = node;
  }
  oncommentend() {
    this.lastNode = null;
  }
  oncdatastart() {
    const text = new Text2("");
    const node = new CDATA2([text]);
    this.addNode(node);
    text.parent = node;
    this.lastNode = text;
  }
  oncdataend() {
    this.lastNode = null;
  }
  onprocessinginstruction(name, data) {
    const node = new ProcessingInstruction(name, data);
    this.addNode(node);
  }
  handleCallback(error) {
    if (typeof this.callback === "function") {
      this.callback(error, this.dom);
    } else if (error) {
      throw error;
    }
  }
  addNode(node) {
    const parent = this.tagStack[this.tagStack.length - 1];
    const previousSibling = parent.children[parent.children.length - 1];
    if (this.options.withStartIndices) {
      node.startIndex = this.parser.startIndex;
    }
    if (this.options.withEndIndices) {
      node.endIndex = this.parser.endIndex;
    }
    parent.children.push(node);
    if (previousSibling) {
      node.prev = previousSibling;
      previousSibling.next = node;
    }
    node.parent = parent;
    this.lastNode = null;
  }
}
// src/css/raster-dimensions.ts
function rasterDimensions(bytes) {
  const size = (w, h) => w > 0 && h > 0 ? { w, h } : undefined;
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString("ascii", 12, 16) === "IHDR")
    return size(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
  if (bytes.length >= 10 && /^(GIF87a|GIF89a)$/.test(bytes.toString("ascii", 0, 6)))
    return size(bytes.readUInt16LE(6), bytes.readUInt16LE(8));
  if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216) {
    let at = 2;
    let orientation = 1;
    let dimensions;
    while (at + 3 < bytes.length) {
      if (bytes[at++] !== 255)
        break;
      while (bytes[at] === 255)
        at++;
      const marker = bytes[at++];
      if (marker === 217 || marker === 218)
        break;
      if (marker === 1 || marker >= 208 && marker <= 215)
        continue;
      if (at + 2 > bytes.length)
        break;
      const length = bytes.readUInt16BE(at);
      if (length < 2 || at + length > bytes.length)
        break;
      if (marker === 225)
        orientation = exifOrientation(bytes, at + 2, at + length) ?? orientation;
      if ((marker >= 192 && marker <= 195 || marker >= 197 && marker <= 199 || marker >= 201 && marker <= 203 || marker >= 205 && marker <= 207) && length >= 7)
        dimensions = size(bytes.readUInt16BE(at + 5), bytes.readUInt16BE(at + 3));
      at += length;
    }
    return dimensions && orientation >= 5 && orientation <= 8 ? { w: dimensions.h, h: dimensions.w } : dimensions;
  }
  if (bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const chunk = bytes.toString("ascii", 12, 16);
    if (chunk === "VP8 " && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42)
      return size(bytes.readUInt16LE(26) & 16383, bytes.readUInt16LE(28) & 16383);
    if (chunk === "VP8L" && bytes[20] === 47)
      return size(1 + bytes[21] + ((bytes[22] & 63) << 8), 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10));
    if (chunk === "VP8X")
      return size(1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16));
  }
  return;
}
function exifOrientation(bytes, start, end) {
  if (start + 14 > end || bytes.toString("ascii", start, start + 4) !== "Exif" || bytes[start + 4] !== 0 || bytes[start + 5] !== 0)
    return;
  const tiff = start + 6;
  const order = bytes.toString("ascii", tiff, tiff + 2);
  if (order !== "II" && order !== "MM")
    return;
  const read16 = (offset) => offset + 2 <= end ? order === "II" ? bytes.readUInt16LE(offset) : bytes.readUInt16BE(offset) : undefined;
  const read32 = (offset) => offset + 4 <= end ? order === "II" ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset) : undefined;
  if (read16(tiff + 2) !== 42)
    return;
  const offset = read32(tiff + 4);
  if (offset === undefined)
    return;
  const ifd = tiff + offset;
  const count = read16(ifd);
  if (count === undefined)
    return;
  for (let index = 0;index < count; index++) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > end)
      break;
    if (read16(entry) !== 274 || read16(entry + 2) !== 3 || read32(entry + 4) !== 1)
      continue;
    const value = read16(entry + 8);
    return value !== undefined && value >= 1 && value <= 8 ? value : undefined;
  }
  return;
}

// src/css/background.ts
function parseBackgroundRepeat(s) {
  const layer = splitTop(s ?? "", ",")[0];
  if (!layer)
    return;
  const [x, y = x] = layer.split(/\s+/).map((t) => t === "space" || t === "round" ? "repeat" : t);
  if (x === "repeat-x" || x === "repeat-y" || x === "no-repeat" || x === "repeat") {
    if (x !== "repeat" && x !== "no-repeat")
      return x;
    if (x === y)
      return x;
    return x === "repeat" ? "repeat-x" : "repeat-y";
  }
  return;
}
function imageSize(url, boxW, boxH) {
  if (/^data:image\//i.test(url) && !/^data:image\/svg\+xml/i.test(url)) {
    const comma = url.indexOf(",");
    if (comma < 0)
      return;
    const header = url.slice(0, comma);
    const payload = url.slice(comma + 1);
    const bytes = /;base64(?:;|$)/i.test(header) ? Buffer.from(payload, "base64") : Buffer.from(payload.replace(/%([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), "latin1");
    return rasterDimensions(bytes);
  }
  if (!/^data:image\/svg\+xml/i.test(url))
    return;
  const comma = url.indexOf(",");
  let svg = url.slice(comma + 1);
  if (/;base64/i.test(url.slice(0, comma)))
    svg = Buffer.from(svg, "base64").toString("utf8");
  else
    svg = decodeURIComponent(svg);
  let root;
  new Parser({ onopentag(name, attrs) {
    if (name === "svg" && !root)
      root = attrs;
  } }, { xmlMode: true, lowerCaseTags: true, lowerCaseAttributeNames: true }).end(svg);
  const size = root && svgRootDimensions(root, boxW !== undefined && boxH !== undefined ? [boxW, boxH] : undefined)?.size;
  return size ? { w: size[0], h: size[1] } : undefined;
}
function parseBackgroundSize(s, boxW, boxH, imgW, imgH) {
  if (!s)
    return;
  const layer = splitTop(s, ",")[0];
  if (!layer)
    return;
  if (layer === "cover" || layer === "contain")
    return layer;
  const parts = splitTop(layer, " ");
  const tw = parts[0], th = parts[1] ?? "auto";
  const w = tw === "auto" ? undefined : resolveLength(tw, boxW);
  const h = th === "auto" ? undefined : resolveLength(th, boxH);
  if (tw !== "auto" && w === undefined || th !== "auto" && h === undefined)
    return;
  if (w !== undefined && h !== undefined)
    return { w, h };
  if (imgW === undefined || imgH === undefined)
    return;
  if (w === undefined && h === undefined)
    return { w: imgW, h: imgH };
  const ratio = imgH === 0 ? 0 : imgW / imgH;
  return w !== undefined ? { w, h: ratio === 0 ? 0 : w / ratio } : { w: h * ratio, h };
}
function parseBackgroundPosition(s, boxW, boxH, imgW = 0, imgH = 0) {
  const tokens = splitTop(splitTop(s ?? "", ",")[0] ?? "", " ");
  if (!tokens.length)
    return [0, 0];
  const spanX = boxW - imgW, spanY = boxH - imgH;
  const isY = (t) => t === "top" || t === "bottom";
  const isX = (t) => t === "left" || t === "right";
  const edge = (t, span) => t === "left" || t === "top" ? 0 : t === "center" ? span / 2 : span;
  if (tokens.length <= 2) {
    let [tx = "center", ty = "center"] = tokens;
    if (isY(tx) || isX(ty))
      [tx, ty] = [ty, tx];
    const x = isX(tx) || tx === "center" ? edge(tx, spanX) : resolveLength(tx, spanX);
    const y = isY(ty) || ty === "center" ? edge(ty, spanY) : resolveLength(ty, spanY);
    return [x ?? 0, y ?? 0];
  }
  let x = 0, y = 0;
  for (let i = 0;i < tokens.length; i++) {
    const t = tokens[i];
    if (!isX(t) && !isY(t) && t !== "center")
      return [0, 0];
    const span = isY(t) ? spanY : spanX;
    const next = tokens[i + 1];
    const off = next !== undefined && !isX(next) && !isY(next) && next !== "center" ? resolveLength(next, span) : undefined;
    if (off !== undefined)
      i++;
    const v = edge(t, span) + (t === "right" || t === "bottom" ? -(off ?? 0) : off ?? 0);
    if (isY(t))
      y = v;
    else
      x = v;
  }
  return [x, y];
}
// src/css/typography.ts
function fontWeight(s) {
  if (!s)
    return 400;
  if (s === "bold")
    return 700;
  if (s === "normal")
    return 400;
  const v = parseInt(s, 10);
  return Number.isFinite(v) ? v : 400;
}
function fontFamilies(s) {
  if (!s)
    return [];
  return splitTop(s, ",").map((f) => f.replace(/^["']|["']$/g, "").trim());
}
// src/css/radius.ts
function parseRadiusXY(s, refW, refH) {
  if (!s)
    return [0, 0];
  const [x = "", y] = splitTop(s, " ");
  return [resolveLength(x, refW) ?? 0, resolveLength(y ?? x, refH) ?? 0];
}
// src/analysis/svg/transforms.ts
var import_svgpath = __toESM(require_svgpath(), 1);
var IDENTITY2 = [1, 0, 0, 1, 0, 0];
function multiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ];
}
function isIdentity(m) {
  return m.every((v, i) => Math.abs(v - IDENTITY2[i]) < 0.000000001);
}
function ownTransform(c, notes) {
  const computed = c.styles["transform"];
  if (computed !== undefined) {
    if (computed === "none")
      return IDENTITY2;
    const m = /^matrix\(([^)]+)\)$/.exec(computed);
    if (!m) {
      notes.push(`approximated: svg 3D transform ignored (${computed})`);
      return IDENTITY2;
    }
    const v = m[1].split(",").map(Number);
    const o = /^([-\d.]+)px\s+([-\d.]+)px/.exec(c.styles["transform-origin"] ?? "");
    if (!o)
      return v;
    const ox = +o[1], oy = +o[2];
    return multiply(multiply([1, 0, 0, 1, ox, oy], v), [1, 0, 0, 1, -ox, -oy]);
  }
  return transformAttr(c.attrs["transform"]);
}
function transformAttr(attr) {
  if (!attr)
    return IDENTITY2;
  const pts = [];
  import_svgpath.default("M0 0L1 0L0 1").transform(attr).iterate((seg) => pts.push(+seg[1], +seg[2]));
  if (pts.length !== 6)
    return IDENTITY2;
  return [pts[2] - pts[0], pts[3] - pts[1], pts[4] - pts[0], pts[5] - pts[1], pts[0], pts[1]];
}
function bake(d, ctm) {
  return isIdentity(ctm) ? d : import_svgpath.default(d).matrix(ctm).round(3).toString();
}
function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

// src/analysis/svg/attributes.ts
var INHERITED_ATTRS = [
  "clip-rule",
  "color",
  "fill",
  "fill-opacity",
  "fill-rule",
  "font-family",
  "font-size",
  "font-weight",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "text-anchor"
];
function inherit(parent, own) {
  const out = { ...parent };
  for (const k of INHERITED_ATTRS)
    if (own[k] !== undefined)
      out[k] = own[k];
  return out;
}
function styleProp(c, attrs, k, scope) {
  const declared = attrs[k];
  if (scope.useColor && declared === "currentColor")
    return scope.useColor;
  return c.styles[k] ?? declared;
}
function reference(c, attrs, k, ctx) {
  const raw = attrs[k] ?? parseDeclared(c.attrs["style"])[k];
  const m = raw && /^url\(["']?#([^"')]+)["']?\)/.exec(raw);
  if (m && !ctx.ids[m[1]])
    ctx.notes.push(`unmapped: svg ${k} url(#${m[1]}) (target not in document)`);
  return m ? ctx.ids[m[1]] : undefined;
}
function parseDash(s) {
  if (!s || s === "none")
    return [];
  const v = s.split(/[\s,]+/).map(parseFloat).filter((x) => Number.isFinite(x) && x >= 0);
  return v.some((x) => x > 0) ? v : [];
}
function num(s, def = 0) {
  const v = s === undefined ? NaN : parseFloat(s);
  return Number.isFinite(v) ? v : def;
}

// src/analysis/typography.ts
var SYSTEM_DESIGNS = {
  "-apple-system": "default",
  arial: "default",
  blinkmacsystemfont: "default",
  courier: "monospaced",
  "courier new": "monospaced",
  cursive: "default",
  fantasy: "default",
  georgia: "serif",
  helvetica: "default",
  "helvetica neue": "default",
  menlo: "monospaced",
  monaco: "monospaced",
  monospace: "monospaced",
  "new york": "serif",
  "sans-serif": "default",
  serif: "serif",
  "sf mono": "monospaced",
  "sf pro": "default",
  "sf pro rounded": "rounded",
  "sf pro text": "default",
  "sfmono-regular": "monospaced",
  "system-ui": "default",
  times: "serif",
  "times new roman": "serif",
  "ui-monospace": "monospaced",
  "ui-rounded": "rounded",
  "ui-sans-serif": "default",
  "ui-serif": "serif"
};
function fontOf(s, families = {}) {
  const size = round2(px(s["font-size"]));
  const spec = { family: { kind: "system", design: "default" }, size, weight: fontWeight(s["font-weight"]) };
  for (const family of fontFamilies(s["font-family"])) {
    const bundled = families[family];
    if (bundled) {
      spec.family = { kind: "custom", name: family };
      if (bundled.opsz)
        spec.opsz = Math.min(bundled.opsz[1], Math.max(bundled.opsz[0], size));
      break;
    }
    const design = SYSTEM_DESIGNS[family.toLowerCase()];
    if (design) {
      spec.family = { kind: "system", design };
      break;
    }
  }
  const lh = s["line-height"];
  if (lh && lh !== "normal")
    spec.lineHeight = round2(px(lh));
  return spec;
}

// src/analysis/svg/text.ts
function collectText(el, scope, pos, ctx) {
  const attrs = { ...scope.attrs, ...el.attrs };
  const at = { x: num(el.attrs["x"], pos.x), y: num(el.attrs["y"], pos.y) };
  const anchorRaw = attrs["text-anchor"];
  const anchor = anchorRaw === "middle" || anchorRaw === "end" ? anchorRaw : "start";
  if (el.tag === "text" && !ctx.notes.includes("approximated: svg text → positioned Text"))
    ctx.notes.push("approximated: svg text → positioned Text");
  for (const c of el.children) {
    if (c.tag === "#text") {
      const text = c.text ?? "";
      if (!text.trim())
        continue;
      const fill = parseColor(styleProp(el, attrs, "fill", scope)) ?? { r: 0, g: 0, b: 0, a: 1 };
      const font = fontOf(el.styles, ctx.bundledFamilies);
      const box = c.bounds.w > 0 ? { x: round2(c.bounds.x - ctx.frame.x), y: round2(c.bounds.y - ctx.frame.y), w: round2(c.bounds.w), h: round2(c.bounds.h) } : derivedBox(text, at, anchor, el, attrs, scope, ctx);
      ctx.texts.push({ text, x: at.x, y: at.y, anchor, font, fill, box });
    } else if (c.tag === "tspan" || c.tag === "a")
      collectText(c, { ...scope, attrs: inherit(scope.attrs, el.attrs) }, at, ctx);
    else if (c.tag === "textpath")
      ctx.notes.push("unmapped: svg textPath");
  }
}
function derivedBox(text, at, anchor, el, attrs, scope, ctx) {
  const size = num(styleProp(el, attrs, "font-size", scope), 16) || 16;
  const w = text.length * size * 0.55;
  const sx = ctx.vb[2] ? ctx.frame.w / ctx.vb[2] : 1;
  const sy = ctx.vb[3] ? ctx.frame.h / ctx.vb[3] : 1;
  const x = anchor === "middle" ? at.x - w / 2 : anchor === "end" ? at.x - w : at.x;
  ctx.notes.push("approximated: svg text box estimated (markup has no measured glyph run)");
  return { x: round2((x - ctx.vb[0]) * sx), y: round2((at.y - size * 0.8 - ctx.vb[1]) * sy), w: round2(w * sx), h: round2(size * sy) };
}
function textContent(el) {
  if (!el)
    return "";
  return el.tag === "#text" ? el.text ?? "" : el.children.map(textContent).join("");
}

// src/analysis/svg/geometry.ts
var import_svgpath2 = __toESM(require_svgpath(), 1);
function ringOf(circle, dash, phase, ctm, vb) {
  if (dash.length !== 1 || dash[0] < 2 * Math.PI * circle.r * 0.99)
    return;
  if (Math.abs(circle.cx - (vb[0] + vb[2] / 2)) > 0.01 || Math.abs(circle.cy - (vb[1] + vb[3] / 2)) > 0.01)
    return;
  const [a, b, c, d, e, f] = ctm;
  if (Math.abs(a - d) > 0.000001 || Math.abs(b + c) > 0.000001 || Math.abs(a * a + b * b - 1) > 0.000001)
    return;
  if (Math.abs(a * circle.cx + c * circle.cy + e - circle.cx) > 0.01 || Math.abs(b * circle.cx + d * circle.cy + f - circle.cy) > 0.01)
    return;
  return { r: circle.r, to: round2(Math.max(0, Math.min(1, 1 - phase / dash[0]))), startAngle: round2(Math.atan2(b, a) * 180 / Math.PI) };
}
function pathBounds(d) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x, y) => {
    if (x < minX)
      minX = x;
    if (x > maxX)
      maxX = x;
    if (y < minY)
      minY = y;
    if (y > maxY)
      maxY = y;
  };
  let cx = 0, cy = 0;
  import_svgpath2.default(d).unshort().unarc().abs().iterate((seg) => {
    const [cmd, ...a] = seg;
    switch (cmd) {
      case "M":
      case "L":
        cx = a[0];
        cy = a[1];
        add(cx, cy);
        break;
      case "H":
        cx = a[0];
        add(cx, cy);
        break;
      case "V":
        cy = a[0];
        add(cx, cy);
        break;
      case "C":
        for (const t of cubicExtrema(cx, a[0], a[2], a[4]))
          add(cubicAt(cx, a[0], a[2], a[4], t), cy);
        for (const t of cubicExtrema(cy, a[1], a[3], a[5]))
          add(cx, cubicAt(cy, a[1], a[3], a[5], t));
        cx = a[4];
        cy = a[5];
        add(cx, cy);
        break;
      case "Q":
        for (const t of quadExtrema(cx, a[0], a[2]))
          add(quadAt(cx, a[0], a[2], t), cy);
        for (const t of quadExtrema(cy, a[1], a[3]))
          add(cx, quadAt(cy, a[1], a[3], t));
        cx = a[2];
        cy = a[3];
        add(cx, cy);
        break;
    }
  });
  if (!Number.isFinite(minX))
    return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
function cubicAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}
function cubicExtrema(p0, p1, p2, p3) {
  const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0;
  const out = [];
  if (Math.abs(a) < 0.000000000001) {
    if (Math.abs(b) > 0.000000000001)
      out.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      out.push((-b + s) / (2 * a), (-b - s) / (2 * a));
    }
  }
  return out.filter((t) => t > 0 && t < 1);
}
function quadAt(p0, p1, p2, t) {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}
function quadExtrema(p0, p1, p2) {
  const den = p0 - 2 * p1 + p2;
  if (Math.abs(den) < 0.000000000001)
    return [];
  const t = (p0 - p1) / den;
  return t > 0 && t < 1 ? [t] : [];
}

// src/analysis/svg/gradients.ts
function gradientOf(raw, bbox, ctx) {
  const id = raw.replace(/^url\(["']?#|["']?\)$/g, "");
  const el = ctx.ids[id];
  if (!el || el.tag !== "lineargradient" && el.tag !== "radialgradient") {
    ctx.notes.push(`unmapped: svg paint url(#${id})`);
    return;
  }
  const chain = [el];
  for (let cur = el, i = 0;i < 8; i++) {
    const href = cur.attrs["href"] ?? cur.attrs["xlink:href"];
    const next = href?.startsWith("#") ? ctx.ids[href.slice(1)] : undefined;
    if (!next || chain.includes(next))
      break;
    chain.push(next);
    cur = next;
  }
  const attr = (k) => chain.map((g) => g.attrs[k]).find((v) => v !== undefined);
  const stopsEl = chain.find((g) => g.children.some((s) => s.tag === "stop")) ?? el;
  const stops = [];
  for (const s of stopsEl.children) {
    if (s.tag !== "stop")
      continue;
    const decl = parseDeclared(s.attrs["style"]);
    const color = parseColor(s.attrs["stop-color"] ?? decl["stop-color"] ?? s.styles["stop-color"] ?? "black");
    if (!color)
      continue;
    const so = parseFloat(s.attrs["stop-opacity"] ?? decl["stop-opacity"] ?? s.styles["stop-opacity"] ?? "1");
    const offRaw = s.attrs["offset"] ?? "0";
    let pos = parseFloat(offRaw) / (offRaw.trim().endsWith("%") ? 100 : 1);
    if (!Number.isFinite(pos))
      pos = 0;
    pos = Math.max(stops[stops.length - 1]?.pos ?? 0, Math.min(1, pos));
    stops.push({ color: Number.isFinite(so) && so < 1 ? { ...color, a: color.a * so } : color, pos });
  }
  if (!stops.length) {
    ctx.notes.push(`unmapped: svg gradient #${id} has no stops`);
    return;
  }
  const [vx, , vw, vh] = ctx.vb;
  const obb = (attr("gradientunits") ?? "objectBoundingBox") !== "userSpaceOnUse";
  const tf = transformAttr(attr("gradienttransform"));
  const toUser = (x, y) => {
    const [tx, ty] = apply(tf, x, y);
    return obb ? [round2(bbox.x + tx * bbox.w), round2(bbox.y + ty * bbox.h)] : [round2(tx), round2(ty)];
  };
  const len = (k, def, span) => {
    const v = attr(k);
    if (v === undefined)
      return def;
    const n = parseFloat(v);
    return v.trim().endsWith("%") ? n / 100 * (obb ? 1 : span) : n;
  };
  if (el.tag === "lineargradient") {
    return { kind: "linear", stops, start: toUser(len("x1", 0, vw), len("y1", 0, vh)), end: toUser(len("x2", obb ? 1 : vx + vw, vw), len("y2", 0, vh)) };
  }
  const diag = Math.hypot(vw, vh) / Math.SQRT2;
  const r = len("r", obb ? 0.5 : diag / 2, diag);
  const center = toUser(len("cx", obb ? 0.5 : vx + vw / 2, vw), len("cy", obb ? 0.5 : ctx.vb[1] + vh / 2, vh));
  const radius = obb ? [round2(r * bbox.w), round2(r * bbox.h)] : [round2(r), round2(r)];
  if (!isIdentity(tf))
    ctx.notes.push("approximated: svg radialGradient gradientTransform → centre only");
  const proportional = Math.abs(bbox.w / vw - bbox.h / vh) < 0.005;
  if (obb && !proportional && Math.abs(radius[0] - radius[1]) > 0.01)
    ctx.notes.push("approximated: svg radialGradient on a non-proportional bounding box → circular");
  return { kind: "radial", stops, center, radius };
}

// src/analysis/svg/traversal.ts
var SVG_SHAPE_TAGS = { path: true, circle: true, rect: true, line: true, polyline: true, polygon: true, ellipse: true };
var GROUP_TAGS = { g: true, svg: true, a: true };
function childScope(c, scope, ctx, extra = IDENTITY2) {
  const own = parseFloat(c.attrs["opacity"] ?? "1");
  return {
    attrs: inherit(scope.attrs, c.attrs),
    ctm: multiply(multiply(scope.ctm, extra), ownTransform(c, ctx.notes)),
    opacity: scope.opacity * (Number.isFinite(own) ? own : 1),
    useColor: scope.useColor,
    depth: scope.depth
  };
}
function visitChildren(el, scope, ctx) {
  for (const c of el.children)
    visitOne(c, scope, ctx);
}
function visitOne(c, scope, ctx) {
  if (SVG_SHAPE_TAGS[c.tag]) {
    const p = shapeToPath(c, childScope(c, scope, ctx), ctx, true);
    if (p)
      ctx.paths.push(p);
  } else if (c.tag === "switch") {
    const inner = childScope(c, scope, ctx);
    for (const k of c.children)
      if (k.bounds.w > 0 || k.bounds.h > 0)
        visitOne(k, inner, ctx);
  } else if (GROUP_TAGS[c.tag]) {
    if (c.tag === "a")
      ctx.notes.push("approximated: svg <a> link → shapes only");
    visitChildren(c, childScope(c, scope, ctx), ctx);
  } else if (c.tag === "use")
    instantiate(c, scope, ctx);
  else if (c.tag === "text")
    collectText(c, childScope(c, scope, ctx), { x: 0, y: 0 }, ctx);
  else if (c.tag === "image")
    ctx.notes.push("unmapped: svg image");
  else if (c.tag === "foreignobject") {
    const text = textContent(c).replace(/\s+/g, " ").trim();
    const sample = text ? ` (text: ${JSON.stringify(text.slice(0, 80))}${text.length > 80 ? "…" : ""})` : "";
    ctx.notes.push(`unmapped: svg <foreignObject> HTML content omitted${sample}`);
  }
}
function instantiate(c, scope, ctx) {
  const href = c.attrs["href"] ?? c.attrs["xlink:href"] ?? "";
  if (!href.startsWith("#")) {
    ctx.notes.push(`unmapped: svg use ${href || "(no href)"}`);
    return;
  }
  const target = ctx.ids[href.slice(1)];
  if (!target) {
    ctx.notes.push(`unmapped: svg use ${href} (target not in document)`);
    return;
  }
  if (scope.depth > 8)
    return;
  const x = num(c.attrs["x"]), y = num(c.attrs["y"]);
  const inner = childScope(c, scope, ctx);
  inner.ctm = multiply(inner.ctm, [1, 0, 0, 1, x, y]);
  inner.useColor = c.styles["color"] ?? scope.useColor;
  inner.depth = scope.depth + 1;
  if (target.tag === "symbol" || target.tag === "svg") {
    const [, , vw, vh] = ctx.vb;
    const w = num(c.attrs["width"] ?? target.attrs["width"], vw), h = num(c.attrs["height"] ?? target.attrs["height"], vh);
    const svb = target.attrs["viewbox"]?.split(/[\s,]+/).map(Number);
    if (svb && svb.length === 4 && svb[2] > 0 && svb[3] > 0) {
      const s = Math.min(w / svb[2], h / svb[3]);
      inner.ctm = multiply(inner.ctm, [s, 0, 0, s, (w - svb[2] * s) / 2 - svb[0] * s, (h - svb[3] * s) / 2 - svb[1] * s]);
    }
    visitChildren(target, { ...inner, attrs: inherit(inner.attrs, target.attrs) }, ctx);
  } else
    visitOne(target, inner, ctx);
}
function shapeToPath(c, scope, ctx, decorate) {
  const attrs = { ...scope.attrs, ...c.attrs };
  const g = (k, def = 0) => num(attrs[k], def);
  let d;
  let circle;
  switch (c.tag) {
    case "path":
      d = attrs["d"];
      break;
    case "circle": {
      const cx = g("cx"), cy = g("cy"), r = g("r");
      d = `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} Z`;
      circle = { cx, cy, r };
      break;
    }
    case "rect": {
      const x = g("x"), y = g("y"), w = g("width"), h = g("height");
      const rx = Math.min(g("rx", g("ry")), w / 2), ry = Math.min(g("ry", g("rx")), h / 2);
      d = rx > 0 && ry > 0 ? `M ${x + rx} ${y} H ${x + w - rx} A ${rx} ${ry} 0 0 1 ${x + w} ${y + ry} V ${y + h - ry} A ${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} H ${x + rx} A ${rx} ${ry} 0 0 1 ${x} ${y + h - ry} V ${y + ry} A ${rx} ${ry} 0 0 1 ${x + rx} ${y} Z` : `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
      break;
    }
    case "line":
      d = `M ${g("x1")} ${g("y1")} L ${g("x2")} ${g("y2")}`;
      break;
    case "polyline":
    case "polygon": {
      const pts = (attrs["points"] ?? "").trim().split(/[\s,]+/).map(Number);
      const parts = [];
      for (let i = 0;i + 1 < pts.length; i += 2)
        parts.push(`${i === 0 ? "M" : "L"} ${pts[i]} ${pts[i + 1]}`);
      d = parts.join(" ") + (c.tag === "polygon" ? " Z" : "");
      break;
    }
    case "ellipse": {
      const cx = g("cx"), cy = g("cy"), rx = g("rx"), ry = g("ry");
      d = `M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy} Z`;
      break;
    }
  }
  if (!d)
    return;
  const p = { d: bake(d, scope.ctm) };
  const prop = (k) => styleProp(c, attrs, k, scope);
  const bbox = pathBounds(p.d);
  const fillRaw = c.tag === "line" ? undefined : prop("fill");
  if (fillRaw && fillRaw !== "none") {
    const grad = fillRaw.startsWith("url(") ? gradientOf(fillRaw, bbox, ctx) : undefined;
    if (grad)
      p.gradient = grad;
    else if (!fillRaw.startsWith("url("))
      p.fill = parseColor(fillRaw);
  }
  if (p.fill || p.gradient) {
    const fo = parseFloat(prop("fill-opacity") ?? "1");
    if (Number.isFinite(fo) && fo < 1)
      p.fillOpacity = fo;
    if (attrs["fill-rule"] === "evenodd")
      p.eoFill = true;
  }
  const strokeRaw = prop("stroke");
  if (strokeRaw && strokeRaw !== "none") {
    const grad = strokeRaw.startsWith("url(") ? gradientOf(strokeRaw, bbox, ctx) : undefined;
    if (grad)
      p.strokeGradient = grad;
    else if (!strokeRaw.startsWith("url("))
      p.stroke = parseColor(strokeRaw);
  }
  if (p.stroke || p.strokeGradient) {
    const [a, b, cc, dd] = scope.ctm;
    const k = Math.sqrt(Math.abs(a * dd - b * cc));
    const scaled = (v) => Math.abs(k - 1) < 0.000000001 ? v : round2(v * k);
    p.strokeWidth = scaled(px(prop("stroke-width") ?? "1"));
    const so = parseFloat(prop("stroke-opacity") ?? "1");
    if (Number.isFinite(so) && so < 1)
      p.strokeOpacity = so;
    const cap = prop("stroke-linecap");
    if (cap === "round" || cap === "square")
      p.lineCap = cap;
    const join = prop("stroke-linejoin");
    if (join === "round" || join === "bevel")
      p.lineJoin = join;
    const miter = parseFloat(attrs["stroke-miterlimit"] ?? "");
    if (Number.isFinite(miter) && miter >= 1)
      p.miterLimit = miter;
    const dash = parseDash(prop("stroke-dasharray"));
    const phase = parseFloat(prop("stroke-dashoffset") ?? "0") || 0;
    const ring = circle && ringOf(circle, dash, phase, scope.ctm, ctx.vb);
    if (ring)
      p.ring = ring;
    else if (dash.length) {
      p.dash = dash.map(scaled);
      if (phase)
        p.dashPhase = scaled(phase);
    }
  }
  const opacity = scope.opacity;
  if (opacity < 1)
    p.opacity = round2(opacity);
  if (decorate) {
    const clip = reference(c, attrs, "clip-path", ctx);
    if (clip)
      p.clip = clipOf(clip, scope, bbox, ctx);
    const mask = reference(c, attrs, "mask", ctx);
    if (mask)
      p.mask = maskOf(mask, scope, ctx);
  }
  return p;
}
function clipOf(el, scope, bbox, ctx) {
  if (el.tag !== "clippath") {
    ctx.notes.push(`unmapped: svg clip-path url(#${el.attrs["id"]})`);
    return;
  }
  const units = el.attrs["clippathunits"] === "objectBoundingBox" ? multiply(scope.ctm, [bbox.w, 0, 0, bbox.h, bbox.x, bbox.y]) : scope.ctm;
  const inner = { ...scope, ctm: multiply(units, ownTransform(el, ctx.notes)), attrs: inherit(scope.attrs, el.attrs) };
  const parts = [];
  let eoFill;
  for (const c of el.children) {
    if (!SVG_SHAPE_TAGS[c.tag] && c.tag !== "use")
      continue;
    const before = ctx.paths.length;
    if (c.tag === "use")
      instantiate(c, inner, ctx);
    else {
      const p = shapeToPath(c, childScope(c, inner, ctx), ctx, false);
      if (p)
        ctx.paths.push(p);
    }
    for (const p of ctx.paths.splice(before))
      parts.push(p.d);
    if ((c.attrs["clip-rule"] ?? el.attrs["clip-rule"]) === "evenodd")
      eoFill = true;
  }
  if (!parts.length)
    return;
  const clip = { d: parts.join(" ") };
  if (eoFill)
    clip.eoFill = true;
  return clip;
}
function maskOf(el, scope, ctx) {
  if (el.tag !== "mask") {
    ctx.notes.push(`unmapped: svg mask url(#${el.attrs["id"]})`);
    return;
  }
  ctx.notes.push("approximated: svg mask → luminance mask");
  const inner = { ...scope, ctm: multiply(scope.ctm, ownTransform(el, ctx.notes)), attrs: inherit(scope.attrs, el.attrs) };
  const before = ctx.paths.length;
  visitChildren(el, inner, ctx);
  const paths = ctx.paths.splice(before);
  return paths.length ? paths : undefined;
}

// src/analysis/svg/build.ts
function buildSvg(n, base, doc = n, bundledFamilies = {}) {
  const vb = (n.attrs["viewbox"] ?? `0 0 ${n.bounds.w} ${n.bounds.h}`).split(/[\s,]+/).map(Number);
  const ctx = { bundledFamilies, ids: idIndex(doc), notes: base.notes, vb, frame: n.bounds, paths: [], texts: [] };
  visitChildren(n, { attrs: inherit({}, n.attrs), ctm: IDENTITY2, opacity: 1, depth: 0 }, ctx);
  base.width = { kind: "fixed", px: round2(n.bounds.w) };
  base.height = { kind: "fixed", px: round2(n.bounds.h) };
  const node = { ...base, kind: "svg", viewBox: vb, paths: ctx.paths };
  if (ctx.texts.length)
    node.texts = ctx.texts;
  const title = textContent(n.children.find((c) => c.tag === "title")).trim();
  if (title)
    node.label = title;
  if (n.attrs["preserveaspectratio"]?.trim().startsWith("none"))
    node.stretch = true;
  return node;
}
var ID_INDEX = new WeakMap;
function idIndex(doc) {
  let index = ID_INDEX.get(doc);
  if (index)
    return index;
  index = {};
  const walk = (el) => {
    const id = el.attrs["id"];
    if (id && !index[id])
      index[id] = el;
    for (const c of el.children)
      walk(c);
  };
  walk(doc);
  ID_INDEX.set(doc, index);
  return index;
}
// src/analysis/svg/markup.ts
function svgFromMarkup(markup, frame) {
  const handler = new DomHandler;
  new Parser(handler, { xmlMode: true, lowerCaseTags: true, lowerCaseAttributeNames: true }).end(markup);
  const rootEl = handler.dom.find((n) => n.type === "tag" && n.name === "svg");
  if (!rootEl)
    return;
  const toLayout = (el) => ({
    tag: el.name,
    attrs: el.attribs,
    styles: {},
    bounds: { x: 0, y: 0, w: 0, h: 0 },
    children: el.children.flatMap((c) => c.type === "tag" ? [toLayout(c)] : c.type === "text" ? [{ tag: "#text", attrs: {}, styles: {}, bounds: { x: 0, y: 0, w: 0, h: 0 }, text: c.data, children: [] }] : [])
  });
  const root = toLayout(rootEl);
  const dimensions = svgRootDimensions(root.attrs);
  if (!dimensions)
    return;
  if (!root.attrs["viewbox"])
    root.attrs["viewbox"] = dimensions.viewBox.join(" ");
  root.bounds = frame;
  const base = {
    id: "svg-markup",
    frame,
    width: { kind: "fixed", px: round2(frame.w) },
    height: { kind: "fixed", px: round2(frame.h) },
    padding: [0, 0, 0, 0],
    style: { fills: [], shadows: [] },
    confidence: "mapped",
    notes: [],
    overlays: []
  };
  const node = buildSvg(root, base);
  node.intrinsicSize = dimensions.size;
  node.invalidIntrinsic = dimensions.invalid;
  node.notes.push(...dimensions.notes);
  const ratio = root.attrs["preserveaspectratio"]?.trim();
  if (ratio && !/^(?:none|xMidYMid(?:\s+meet)?)$/i.test(ratio))
    node.notes.push(`approximated: SVG preserveAspectRatio ${ratio} uses centred meet alignment`);
  if (node.notes.some((s) => s.startsWith("unmapped")))
    node.confidence = "unmapped";
  else if (node.notes.some((s) => s.startsWith("approximated")))
    node.confidence = "approximated";
  return node;
}
// src/html/inputs.ts
var INPUT_CONTROLS = Object.freeze({
  button: "button",
  checkbox: "toggle",
  color: "colorPicker",
  date: "datePicker",
  "datetime-local": "datePicker",
  email: "textField",
  file: "button",
  month: "datePicker",
  number: "textField",
  password: "secureField",
  radio: "radio",
  range: "slider",
  reset: "button",
  search: "textField",
  submit: "button",
  tel: "textField",
  text: "textField",
  time: "datePicker",
  url: "textField",
  week: "datePicker"
});
var INPUT_PLACEHOLDERS = Object.freeze({
  hidden: "no box of its own; an unexpected captured box has no native control",
  image: "image submit buttons are not translated; placeholder box only"
});

// src/analysis/link-destination.ts
function nativeExternalURL(href) {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1]?.toLowerCase();
  if (!scheme || !["http", "https", "mailto", "tel"].includes(scheme))
    return;
  if ((scheme === "http" || scheme === "https") && !/^https?:\/\//i.test(href))
    return;
  try {
    const url = new URL(href);
    const hasDestination = scheme === "http" || scheme === "https" ? Boolean(url.hostname) : Boolean(url.pathname);
    return hasDestination ? url.href : undefined;
  } catch {
    return;
  }
}
function linkDestinationLoss(href) {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) ? "unsupported or malformed URL" : "app navigation route or fragment";
}

// src/analysis/controls.ts
function controlOf(n) {
  const a = n.attrs;
  const notes = [];
  const disabled = "disabled" in a ? true : undefined;
  switch (n.tag) {
    case "button": {
      const spec = { control: "button", notes };
      if (a["onclick"])
        spec.action = a["onclick"];
      if (disabled)
        spec.disabled = true;
      return spec;
    }
    case "a": {
      const href = a["href"];
      if (href === undefined)
        return;
      const destination = nativeExternalURL(href);
      const spec = { control: "link", href: destination ?? href, notes };
      if (!destination) {
        spec.action = a["onclick"] || `#${targetName(href, n)}`;
        notes.push(`approximated: <a href="${href}"> has no supported runtime destination → Button over a placeholder action`);
      }
      return spec;
    }
    case "textarea": {
      const spec = { control: "textEditor", notes };
      const text = a["value"] ?? textOf(n).trim();
      if (text)
        spec.value = text;
      if (a["placeholder"])
        spec.placeholder = a["placeholder"];
      if (disabled)
        spec.disabled = true;
      return spec;
    }
    case "select": {
      const options = [];
      let selected;
      for (const o of optionsOf(n)) {
        const label = (o.attrs["label"] ?? textOf(o)).trim();
        if (label)
          options.push(label);
        if ("selected" in o.attrs)
          selected = label;
      }
      const spec = { control: "picker", options, notes };
      const shown = selected || options[0];
      if (shown)
        spec.value = shown;
      if (!options.length)
        notes.push("approximated: <select> option labels are not in the snapshot → picker with no choices");
      if (a["multiple"] !== undefined || a["size"] !== undefined && Number(a["size"]) > 1)
        notes.push("approximated: <select multiple/size> list box → menu picker");
      if (disabled)
        spec.disabled = true;
      return spec;
    }
    case "details": {
      const spec = { control: "disclosure", notes };
      if ("open" in a)
        spec.expanded = true;
      return spec;
    }
    case "progress":
    case "meter": {
      const min = num2(a["min"]) ?? 0;
      const max = num2(a["max"]) ?? 1;
      const spec = { control: n.tag === "progress" ? "progress" : "gauge", range: { min, max: Math.max(max, min) }, notes };
      const v = a["value"];
      if (v !== undefined && num2(v) !== undefined)
        spec.value = v;
      else if (n.tag === "progress")
        notes.push("approximated: indeterminate <progress> → animated bar");
      if (n.tag === "meter")
        spec.level = meterLevel(num2(a["value"]) ?? 0, min, Math.max(max, min), num2(a["low"]), num2(a["high"]), num2(a["optimum"]));
      return spec;
    }
    case "input": {
      const type = (a["type"] ?? "text").toLowerCase();
      if (Object.hasOwn(INPUT_PLACEHOLDERS, type))
        return;
      const control = Object.hasOwn(INPUT_CONTROLS, type) ? INPUT_CONTROLS[type] : "textField";
      if (!Object.hasOwn(INPUT_CONTROLS, type))
        notes.push(`approximated: <input type="${type}"> is not a type HTML defines → text field, which is what the browser rendered`);
      const spec = { control, notes };
      if (control === "toggle" || control === "radio") {
        if ("checked" in a)
          spec.checked = true;
      } else if (a["value"] !== undefined)
        spec.value = a["value"];
      else if (type === "submit")
        spec.value = "Submit";
      else if (type === "reset")
        spec.value = "Reset";
      if (type === "submit")
        notes.push('approximated: <input type="submit"> form submission and validation require an app action');
      if (type === "reset")
        notes.push('approximated: <input type="reset"> form reset requires an app action');
      if (type === "button" || type === "submit" || type === "reset") {
        const transform = n.styles["text-transform"];
        if (transform === "uppercase" || transform === "lowercase" || transform === "capitalize") {
          spec.captionTransform = transform;
          if (transform === "capitalize")
            notes.push("approximated: text-transform: capitalize on input button caption is not translated");
        }
      }
      if (control === "slider") {
        const min = num2(a["min"]) ?? 0;
        const max = num2(a["max"]) ?? 100;
        spec.range = { min, max: Math.max(max, min) };
        const step = num2(a["step"]);
        if (step !== undefined && step > 0)
          spec.range.step = step;
      }
      if (a["placeholder"])
        spec.placeholder = a["placeholder"];
      if (type === "file") {
        const accept = (a["accept"] ?? "").split(",").map((t) => t.trim()).filter(Boolean);
        spec.files = { accept };
        if ("multiple" in a)
          spec.files.multiple = true;
        notes.push(`approximated: <input type="file"> → Button presenting .fileImporter; Chrome's "Choose file" caption and filename text are shadow DOM the capture cannot reach`);
      }
      if (control === "button" && a["onclick"])
        spec.action = a["onclick"];
      if (disabled)
        spec.disabled = true;
      return spec;
    }
    default:
      return;
  }
}
function buildControl(spec, parts) {
  const { control, notes, ...state } = spec;
  const base = parts.base;
  base.notes.push(...notes);
  let label;
  const kids = parts.children.filter((c) => {
    if (control === "disclosure" && c.node.tag === "summary" && !label) {
      label = c.sem;
      return false;
    }
    return true;
  });
  const content = [...kids.map((c) => c.sem), ...parts.texts].sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x);
  const only = content.length === 1 ? content[0] : undefined;
  if (only && only.kind === "text" && !parts.children.length) {
    const [pt, pr, pb, pl] = base.padding;
    only.frame = { x: base.frame.x + pl, y: base.frame.y + pt, w: base.frame.w - pl - pr, h: base.frame.h - pt - pb };
    if (base.width.kind !== "hug")
      only.width = { kind: "fill" };
  }
  const node = { ...base, kind: "control", control, content, ...state };
  if (label)
    node.label = label;
  if (parts.font && (SELF_DRAWN_TEXT[control] || control === "button" && state.value !== undefined && !state.files)) {
    node.font = parts.font;
    if (parts.color)
      node.color = parts.color;
  }
  return node;
}
function targetName(href, n) {
  const hash = href.indexOf("#");
  const fragment = hash < 0 ? "" : href.slice(hash + 1);
  const path = (hash < 0 ? href : href.slice(0, hash)).split("?")[0].split("/").filter(Boolean).pop() ?? "";
  const name = fragment || path || textOf(n).trim() || n.id || "link";
  return name.slice(0, 40);
}
function meterLevel(value, min, max, low, high, optimum) {
  const lo = Math.min(Math.max(low ?? min, min), max);
  const hi = Math.min(Math.max(high ?? max, lo), max);
  const opt = Math.min(Math.max(optimum ?? (min + max) / 2, min), max);
  const v = Math.min(Math.max(value, min), max);
  if (opt < lo)
    return v <= lo ? "optimum" : v <= hi ? "suboptimal" : "poor";
  if (opt > hi)
    return v >= hi ? "optimum" : v >= lo ? "suboptimal" : "poor";
  return v >= lo && v <= hi ? "optimum" : "suboptimal";
}
var SELF_DRAWN_TEXT = { textField: true, secureField: true, textEditor: true, picker: true, datePicker: true, stepper: true };
function textOf(n) {
  if (n.tag === "#text")
    return n.text ?? "";
  return n.children.map(textOf).join("");
}
function optionsOf(n) {
  const out = [];
  for (const c of n.children) {
    if (c.tag === "option")
      out.push(c);
    else if (c.tag === "optgroup")
      out.push(...optionsOf(c));
  }
  return out;
}
function num2(v) {
  if (v === undefined)
    return;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// src/html/elements.ts
function family(tags, route, support = "implemented", limitation) {
  return Object.fromEntries(tags.split(" ").map((tag) => [tag, Object.freeze({
    route,
    support,
    known: true,
    atomic: !!limitation || ["control", "image", "svg", "placeholder", "metadata"].includes(route),
    ...limitation ? { note: `${support === "unsupported" ? "unmapped" : "approximated"}: <${tag}> ${limitation}` } : {}
  })]));
}
var HTML_ELEMENTS = Object.freeze({
  ...family("address article aside blockquote body caption dd div dl dt fieldset figcaption figure footer h1 h2 h3 h4 h5 h6 header hgroup hr html legend li main menu nav ol p picture pre search section summary ul", "flow"),
  ...family("a abbr b bdi bdo cite code data del dfn em i ins kbd mark noscript optgroup option output q rp s samp small span strong sub sup time u var wbr", "text"),
  ...family("button details input meter progress select textarea", "control"),
  ...family("img", "image"),
  ...family("svg", "svg"),
  ...family("br", "line-break"),
  ...family("area base datalist head link meta script source style template title track", "metadata", "nonvisual"),
  ...family("table tbody td tfoot th thead tr col colgroup", "flow", "approximated", "→ measured rows/cells; a subset of equal-column fixed tables resizes natively; spans, other column rules and table accessibility are not translated"),
  ...family("ruby rt", "flow", "approximated", "→ measured annotation boxes; ruby associations and paragraph reflow are not translated"),
  ...family("form", "flow", "approximated", "→ measured content; browser form submission and validation are not translated"),
  ...family("label", "text", "approximated", "→ styled text; label-to-control focus behavior is not translated"),
  ...family("dialog", "flow", "approximated", "→ captured visibility; modal presentation and lifecycle are not translated"),
  ...family("map", "flow", "approximated", "→ measured content; image-map hit regions and navigation are not translated"),
  ...family("slot selectedcontent", "flow", "approximated", "→ captured content; live slot distribution or selected-content updates are not translated"),
  ...family("canvas", "placeholder", "unsupported", "script-drawn bitmap is not translated; placeholder box only"),
  ...family("iframe", "placeholder", "unsupported", "nested document is outside the capture root; placeholder box only"),
  ...family("embed object", "placeholder", "unsupported", "embedded resource is not translated; measured box and any captured object fallback only"),
  ...family("audio video", "placeholder", "unsupported", "media content, browser player controls and playback are not translated; placeholder box only"),
  ...family("math", "placeholder", "unsupported", "MathML notation requires a dedicated renderer; placeholder box only")
});

// src/html/policy.ts
function classifyElement(tag, attrs = {}) {
  if (tag === "#text" || tag === "::before" || tag === "::after" || tag === "::marker") {
    return { route: "text", support: "implemented", atomic: false, known: true };
  }
  if (tag === "a" && attrs["href"] !== undefined)
    return { route: "control", support: "implemented", atomic: false, known: true };
  if (tag === "img" && attrs["usemap"] !== undefined)
    return {
      route: "image",
      support: "approximated",
      atomic: true,
      known: true,
      note: "approximated: <img usemap> image-map hit regions and navigation are not translated"
    };
  if (tag === "video" && attrs["poster"]?.trim())
    return {
      route: "image",
      support: "approximated",
      atomic: true,
      known: true,
      note: "approximated: <video poster> → static poster image; playback and controls are not translated"
    };
  if (tag === "input") {
    const type = (attrs["type"] ?? "text").toLowerCase();
    const why = Object.hasOwn(INPUT_PLACEHOLDERS, type) ? INPUT_PLACEHOLDERS[type] : undefined;
    if (why)
      return { route: "placeholder", support: "unsupported", atomic: true, known: true, note: `unmapped: <input type="${type}"> ${why}` };
  }
  if (Object.hasOwn(HTML_ELEMENTS, tag))
    return HTML_ELEMENTS[tag];
  return {
    route: "flow",
    support: "approximated",
    atomic: true,
    known: false,
    note: `approximated: <${tag}> ${tag.includes("-") ? "custom element" : "unclassified element"} → measured content; custom semantics and behavior are not translated`
  };
}

// src/analysis/geometry.ts
function renders(n) {
  return n.styles["display"] !== "none";
}
function hangsLeading(box, x) {
  return box.w > 0 && box.x + box.w <= x + 0.5;
}
function fillsWidthInside(n) {
  return (n.kind === "stack" || n.kind === "grid") && n.children.some((c) => c.width.kind === "fill" || fillsWidthInside(c));
}
function floating(n) {
  return n.styles["float"] === "left" || n.styles["float"] === "right";
}
function lineTops(el) {
  const boxes = [];
  const collect = (n) => {
    for (const l of n.lines ?? [])
      boxes.push(l.bounds);
    for (const c of n.children)
      collect(c);
  };
  collect(el);
  boxes.sort((a, b) => a.y - b.y);
  const tops = [];
  for (const b of boxes)
    if (tops.length === 0 || b.y - tops[tops.length - 1] >= Math.max(1, b.h / 2))
      tops.push(b.y);
  return tops;
}
var EDGES = ["top", "right", "bottom", "left"];
function edgeWidth(s, edge) {
  const st = s[`border-${edge}-style`];
  return st && st !== "none" && st !== "hidden" ? px(s[`border-${edge}-width`]) : 0;
}
function insetsOf(s) {
  return EDGES.map((e) => px(s[`padding-${e}`]) + edgeWidth(s, e));
}
function unionRect(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

// src/analysis/style-background.ts
function textPaintOf(el, run) {
  if (!/\btext\b/.test(el.styles["background-clip"] ?? ""))
    return;
  const p = parseBackgroundImage(el.styles["background-image"]).find((p) => p.kind === "linear" || p.kind === "radial" || p.kind === "conic");
  return p && paintWithin(resolvePaint(p, el.bounds.w, el.bounds.h), el.bounds, run);
}
function layerValue(list, i) {
  const parts = splitTop(list ?? "", ",");
  return parts.length ? parts[i % parts.length] : undefined;
}
function imagePaint(url, s, prop, i, w, h) {
  const img = imageSize(url, w, h);
  const size = parseBackgroundSize(layerValue(s[`${prop}-size`], i), w, h, img?.w, img?.h);
  const paint = { kind: "image", url };
  if (size !== undefined)
    paint.size = size;
  let drawn;
  if (size === "cover" || size === "contain") {
    if (img && img.w > 0 && img.h > 0) {
      const k = size === "cover" ? Math.max(w / img.w, h / img.h) : Math.min(w / img.w, h / img.h);
      drawn = { w: img.w * k, h: img.h * k };
    }
  } else
    drawn = size ?? img;
  const pos = layerValue(s[`${prop}-position`], i);
  if (drawn)
    paint.position = parseBackgroundPosition(pos, w, h, drawn.w, drawn.h).map(round2);
  else if (pos && /^(0(px|%)?|left|top)(\s+(0(px|%)?|left|top))?$/.test(pos))
    paint.position = [0, 0];
  const repeat = parseBackgroundRepeat(layerValue(s[`${prop}-repeat`], i));
  if (repeat && size !== "cover" && size !== "contain")
    paint.repeat = repeat;
  return paint;
}
function backgroundFills(s, w, h, notes) {
  const fills = [];
  const bg = parseColor(s["background-color"]);
  if (bg && bg.a > 0)
    fills.push({ kind: "solid", color: bg });
  const layers = parseBackgroundImage(s["background-image"]);
  for (let i = 0;i < layers.length; i++) {
    const p = layers[i];
    const top = layers.length - 1 - i;
    if (p.kind === "unsupported")
      notes.push(`unmapped: background-image ${p.raw.slice(0, 40)}`);
    else if (p.kind === "image")
      fills.push(imagePaint(p.url, s, "background", top, w, h));
    else {
      if (p.kind !== "solid" && p.repeating)
        notes.push(`approximated: repeating ${p.kind} gradient tiled from its first period`);
      fills.push(resolvePaint(p, w, h));
    }
  }
  const clipBox = s["background-clip"];
  if (clipBox && /\btext\b/.test(clipBox))
    fills.length = 0;
  else if (clipBox && /\b(padding|content)-box\b/.test(clipBox)) {
    const boxes = splitTop(clipBox, ",");
    const imageStart = fills.length - layers.filter((p) => p.kind !== "unsupported").length;
    fills.forEach((f, j) => {
      if (f.kind === "unsupported")
        return;
      const box = j < imageStart ? boxes[boxes.length - 1] : boxes[(fills.length - 1 - j) % boxes.length];
      if (box !== "padding-box" && box !== "content-box")
        return;
      f.inset = EDGES.map((e) => round2(edgeWidth(s, e) + (box === "content-box" ? px(s[`padding-${e}`]) : 0)));
    });
  }
  const blendModes = parseBlendModes(s["background-blend-mode"]);
  if (blendModes.length && blendModes.some((b) => b !== "normal")) {
    for (let j = 1;j < fills.length; j++) {
      const f = fills[j];
      if (f.kind === "unsupported")
        continue;
      const mode = blendModes[(fills.length - 1 - j) % blendModes.length];
      if (mode !== "normal")
        f.blend = mode;
    }
  }
  return fills;
}

// src/analysis/style-border.ts
var BLINK_SCALE = 255.99998474121094;
function shade(c, dir) {
  const v = Math.max(c.r, c.g, c.b);
  if (dir === "light" && v === 0)
    return { r: 84 / 255, g: 84 / 255, b: 84 / 255, a: c.a };
  const m = dir === "dark" ? Math.max(0, (v - 0.33) / v) : Math.min(1, v + 0.33) / v;
  const ch = (x) => Math.floor(m * x * BLINK_SCALE) / 255;
  return { r: ch(c.r), g: ch(c.g), b: ch(c.b), a: c.a };
}
function relLuminance(c) {
  const lin = (x) => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}
function litEdge(c) {
  const y = relLuminance(c);
  const d = relLuminance(shade(c, "dark"));
  return (Math.max(y, d) + 0.05) / (Math.min(y, d) + 0.05) < 1.75 ? shade(c, "light") : c;
}
function borderStyle(s, w, h, notes) {
  const corners = ["top-left", "top-right", "bottom-right", "bottom-left"];
  const cornerRadii = corners.map((c) => parseRadiusXY(s[`border-${c}-radius`], w, h));
  const ellipse = w > 0 && h > 0 && cornerRadii.every(([rx, ry]) => Math.abs(rx - w / 2) < 0.5 && Math.abs(ry - h / 2) < 0.5);
  const r = cornerRadii.map(([rx, ry], i) => {
    if (!ellipse && Math.abs(rx - ry) > 0.5)
      notes.push(`approximated: elliptical radius ${s[`border-${corners[i]}-radius`]} → circular`);
    return round2(Math.min((rx + ry) / 2, Math.min(w, h) / 2));
  });
  const style = {};
  if (ellipse)
    style.ellipse = true;
  if (r.some((v) => v > 0))
    style.radius = r;
  const edges = {};
  for (const e of EDGES) {
    const width = edgeWidth(s, e);
    const color = parseColor(s[`border-${e}-color`]);
    if (width <= 0 || !color || color.a <= 0)
      continue;
    const st = s[`border-${e}-style`];
    if (st === "solid" || st === "dashed" || st === "dotted" || st === "double")
      edges[e] = { width, color, style: st };
    else if (st === "inset" || st === "outset" || st === "groove" || st === "ridge") {
      const shadowed = st === "inset" || st === "groove" ? e === "top" || e === "left" : e === "bottom" || e === "right";
      edges[e] = { width, color: shadowed ? shade(color, "dark") : litEdge(color), style: "solid" };
      if (st === "groove" || st === "ridge")
        notes.push(`approximated: border-${e}-style ${st} → its outer half's tone across the edge`);
    } else {
      edges[e] = { width, color, style: "solid" };
      notes.push(`approximated: border-${e}-style ${st} → solid`);
    }
  }
  const top = edges.top;
  const uniform = top && EDGES.every((e) => edges[e]?.width === top.width && edges[e]?.style === top.style && JSON.stringify(edges[e]?.color) === JSON.stringify(top.color));
  if (top && uniform && (top.style === "solid" || top.style === "dashed")) {
    style.border = { width: top.width, color: top.color };
    if (top.style === "dashed")
      style.border.dashed = true;
  } else if (Object.keys(edges).length)
    style.borderSides = edges;
  return style;
}

// src/analysis/class-hints.ts
var COLOR_UTILS = [
  "bg",
  "text",
  "border",
  "border-t",
  "border-r",
  "border-b",
  "border-l",
  "border-x",
  "border-y",
  "divide",
  "ring",
  "ring-offset",
  "outline",
  "shadow",
  "fill",
  "stroke",
  "accent",
  "caret",
  "decoration",
  "placeholder",
  "from",
  "via",
  "to"
];
var NOT_A_COLOR = {
  xs: true,
  sm: true,
  base: true,
  md: true,
  lg: true,
  xl: true,
  "2xl": true,
  "3xl": true,
  "4xl": true,
  "5xl": true,
  "6xl": true,
  "7xl": true,
  "8xl": true,
  "9xl": true,
  none: true,
  inherit: true,
  auto: true,
  solid: true,
  dashed: true,
  dotted: true,
  double: true,
  hidden: true,
  current: true,
  transparent: true,
  left: true,
  center: true,
  right: true,
  justify: true,
  start: true,
  end: true,
  wrap: true,
  nowrap: true,
  balance: true,
  pretty: true,
  ellipsis: true,
  clip: true,
  truncate: true,
  collapse: true,
  separate: true,
  inner: true,
  reverse: true,
  x: true,
  y: true,
  t: true,
  r: true,
  b: true,
  l: true,
  fixed: true,
  local: true,
  scroll: true,
  cover: true,
  contain: true,
  repeat: true,
  "no-repeat": true,
  visible: true,
  top: true,
  bottom: true,
  slice: true,
  clone: true,
  inset: true
};
var NOT_A_COLOR_FAMILY = ["bg-clip-", "bg-blend-", "bg-origin-", "bg-gradient-", "bg-linear-", "bg-radial-", "bg-conic-", "bg-position-", "bg-size-", "text-shadow-", "border-spacing-", "outline-offset-"];
function classColorHints(attrs) {
  const out = [];
  for (const raw of (attrs["class"] ?? "").split(/\s+/)) {
    if (!raw)
      continue;
    const parts = raw.split(":");
    const util = parts[parts.length - 1].replace(/^!/, "").replace(/!$/, "");
    if (parts.length > 1 && !parts.slice(0, -1).every((v) => v === "dark"))
      continue;
    if (util.includes("["))
      continue;
    const hint = colorHint(util);
    if (hint && !out.includes(hint))
      out.push(hint);
  }
  return out;
}
function colorHint(util) {
  if (NOT_A_COLOR_FAMILY.some((p) => util.startsWith(p)))
    return;
  const prefix = COLOR_UTILS.filter((p) => util.startsWith(p + "-")).sort((a, b) => b.length - a.length)[0];
  if (!prefix)
    return;
  const value = util.slice(prefix.length + 1).split("/")[0];
  if (!value || NOT_A_COLOR[value] || /^\d+(?:\.\d+)?(?:px|rem|em|%)?$/.test(value))
    return;
  return value;
}

// src/analysis/style-effects.ts
function applyEffects(n, style, notes) {
  const s = n.styles;
  reportStaticMotion(s, (note) => notes.push(note));
  const { w, h } = n.bounds;
  const op = parseFloat(s["opacity"] ?? "1");
  if (op < 1)
    style.opacity = op;
  const ox = s["overflow-x"];
  const oy = s["overflow-y"];
  if (ox === "hidden" || ox === "clip" || oy === "hidden" || oy === "clip")
    style.clip = true;
  const { filters, unsupported } = parseFilters(s["filter"]);
  for (const f of unsupported)
    notes.push(`unmapped: filter ${f.slice(0, 40)}`);
  if (filters.length === 1 && filters[0].kind === "blur")
    style.blur = filters[0].radius;
  else if (filters.length)
    style.filters = filters;
  for (const f of filters)
    if (f.kind === "drop-shadow" || f.kind === "sepia")
      notes.push(`approximated: filter ${f.kind}`);
  const bf = s["backdrop-filter"];
  if (bf && bf !== "none") {
    const m = /blur\(([\d.]+)px\)/.exec(bf);
    style.backdropBlur = m ? +m[1] : 0;
    notes.push("approximated: backdrop-filter → translucent fill only (no blur)");
  }
  const tf = parseTransform(s["transform"]);
  if (tf?.flattened)
    notes.push("approximated: transform matrix3d flattened to its x/y projection");
  if (tf && (tf.rotate !== 0 || tf.scaleX !== 1 || tf.scaleY !== 1 || tf.tx !== 0 || tf.ty !== 0 || tf.skewX !== undefined || tf.skewY !== undefined)) {
    const { flattened: _, ...affine } = tf;
    style.transform = affine;
    const origin = parseOrigin(s["transform-origin"]);
    if (origin)
      style.transform.origin = origin;
  } else if (s["transform"] && s["transform"] !== "none" && !tf)
    notes.push(`unmapped: transform ${s["transform"].slice(0, 40)}`);
  if (style.shadows.some((sh) => sh.inset && sh.blur > 0))
    notes.push("approximated: inset shadow blur → native Gaussian blur");
  const blend = s["mix-blend-mode"];
  if (blend && blend !== "normal") {
    if (parseBlendMode(blend))
      style.blend = blend;
    else
      notes.push(`unmapped: mix-blend-mode ${blend}`);
  }
  const cp = s["clip-path"];
  if (cp && cp !== "none") {
    const shape = parseClipPath(cp, w, h);
    if (shape)
      style.clipPath = shape;
    else
      notes.push(`unmapped: clip-path ${cp.slice(0, 40)}`);
  }
  const mi = s["mask-image"];
  if (mi && mi !== "none") {
    const masks = parseBackgroundImage(mi);
    const first = masks[masks.length - 1];
    if (masks.length > 1)
      notes.push("approximated: mask-image first layer only");
    if (first.kind === "unsupported")
      notes.push(`unmapped: mask-image ${first.raw.slice(0, 40)}`);
    else if (first.kind === "image")
      style.mask = imagePaint(first.url, s, "mask", 0, w, h);
    else
      style.mask = resolvePaint(first, w, h);
  }
  const vis = s["visibility"];
  if (vis === "hidden" || vis === "collapse") {
    style.hidden = true;
    if (vis === "collapse")
      notes.push("approximated: visibility: collapse → hidden (space kept)");
  }
  if (s["position"] === "sticky")
    notes.push("approximated: position: sticky (snapshot position)");
  const os = s["outline-style"];
  const ow = px(s["outline-width"]);
  const oc = parseColor(s["outline-color"]);
  if (os && os !== "none" && ow > 0 && oc && oc.a > 0) {
    const known = os === "solid" || os === "dashed" || os === "dotted" || os === "double";
    if (!known)
      notes.push(`approximated: outline-style ${os} → solid`);
    style.outline = { width: ow, color: oc, style: known ? os : "solid", offset: px(s["outline-offset"]) };
  }
  const tokens = [...[...(n.attrs["style"] ?? "").matchAll(/var\(--([\w-]+)/g)].map((m) => m[1]), ...classColorHints(n.attrs)];
  if (tokens.length)
    style.tokens = [...new Set(tokens)];
}
function reportStaticMotion(styles, note) {
  if (hasTimedProperty(styles["animation-name"] ?? "none", styles["animation-duration"] ?? "0s")) {
    note("approximated: CSS animation captured as a static state; keyframes are not translated");
  }
  if (hasTimedProperty(styles["transition-property"] ?? "all", styles["transition-duration"] ?? "0s")) {
    note("approximated: CSS transition captured as a static state; runtime transitions are not translated");
  }
}
function hasTimedProperty(properties, durations) {
  const names = properties.split(",").map((value) => value.trim().toLowerCase());
  const times = durations.split(",").map((value) => parseFloat(value.trim()));
  return names.some((name, i) => name !== "none" && Number.isFinite(times[i % times.length]) && times[i % times.length] > 0);
}

// src/analysis/style.ts
function styleOf(n, notes) {
  const s = n.styles;
  const { w, h } = n.bounds;
  const style = { fills: backgroundFills(s, w, h, notes), shadows: parseShadows(s["box-shadow"]) };
  Object.assign(style, borderStyle(s, w, h, notes));
  applyEffects(n, style, notes);
  return style;
}

// src/analysis/text-runs.ts
function isInlineText(c) {
  if (classifyElement(c.tag, c.attrs).atomic)
    return false;
  if ((c.styles["display"] ?? "inline") !== "inline")
    return false;
  const pos = c.styles["position"];
  if (pos === "absolute" || pos === "fixed")
    return false;
  return c.children.every((k) => k.tag === "#text" || k.tag === "br" || k.tag === "wbr" || isInlineText(k));
}
function collectRuns(el, runs) {
  for (const k of el.children) {
    if (k.tag === "#text" || k.tag === "br" || k.tag === "wbr")
      runs.push({ node: k, styleOf: el });
    else
      collectRuns(k, runs);
  }
}
function groupRuns(host, runs) {
  const groups = [];
  let cur = [];
  let lastIdx = -2;
  const order = host.children;
  for (const r of runs) {
    const top = r.styleOf === host ? r.node : ancestorChildOf(host, r.styleOf);
    const idx = order.indexOf(top);
    if (cur.length && idx !== lastIdx + 1) {
      groups.push(cur);
      cur = [];
    }
    cur.push(r);
    lastIdx = idx;
  }
  if (cur.length)
    groups.push(cur);
  return groups;
}
function ancestorChildOf(host, el) {
  for (const c of host.children)
    if (c === el || contains(c, el))
      return c;
  return el;
}
function contains(a, b) {
  return a.children.some((c) => c === b || contains(c, b));
}
function collapseOf(s) {
  const v = s["white-space-collapse"];
  if (v)
    return v === "collapse" ? "collapse" : v === "preserve-breaks" ? "preserve-breaks" : "preserve";
  const ws = s["white-space"] ?? "normal";
  if (ws === "pre" || ws === "pre-wrap" || ws === "break-spaces")
    return "preserve";
  return ws === "pre-line" ? "preserve-breaks" : "collapse";
}
function noWrap(s) {
  const v = s["text-wrap-mode"];
  if (v)
    return v === "nowrap";
  const ws = s["white-space"];
  return ws === "nowrap" || ws === "pre";
}
function normalizeWhitespace(text, mode) {
  if (mode === "preserve")
    return { text, src: Array.from(text, (_, i) => i) };
  let out = "";
  const src = [];
  for (let i = 0;i < text.length; ) {
    if (!WS.test(text[i])) {
      out += text[i];
      src.push(i);
      i++;
      continue;
    }
    let j = i;
    let breaks = 0;
    for (;j < text.length && WS.test(text[j]); j++)
      if (text[j] === `
`)
        breaks++;
    for (let k = 0;k < (mode === "preserve-breaks" && breaks > 0 ? breaks : 1); k++) {
      out += mode === "preserve-breaks" && breaks > 0 ? `
` : " ";
      src.push(i);
    }
    i = j;
  }
  return { text: out, src };
}
var WS = /\s/;
function decorationOf(s, color) {
  const raw = s["-webkit-text-decorations-in-effect"] ?? s["text-decoration-line"] ?? "none";
  const lines = raw.split(/\s+/).filter((l) => l === "underline" || l === "line-through" || l === "overline");
  if (!lines.length)
    return;
  const d = { lines };
  const dc = parseColor(s["text-decoration-color"]);
  if (dc && (dc.r !== color.r || dc.g !== color.g || dc.b !== color.b || dc.a !== color.a))
    d.color = dc;
  const st = s["text-decoration-style"];
  if (st === "double" || st === "dotted" || st === "dashed" || st === "wavy")
    d.style = st;
  return d;
}

// src/analysis/alignment.ts
function crossAlign(n, axis) {
  const display = n.styles["display"] ?? "block";
  if (!/flex/.test(display))
    return "stretch";
  const ai = n.styles["align-items"] ?? "normal";
  if (ai === "center")
    return "center";
  if (ai === "flex-end" || ai === "end")
    return "end";
  if (ai === "flex-start" || ai === "start")
    return "start";
  if (ai === "baseline")
    return "baseline";
  return axis === "h" ? "stretch" : "stretch";
}
function distributionOf(jc, display) {
  if (!/flex/.test(display))
    return "start";
  switch (jc) {
    case "center":
      return "center";
    case "flex-end":
    case "end":
      return "end";
    case "space-between":
      return "between";
    case "space-around":
      return "around";
    case "space-evenly":
      return "evenly";
    default:
      return "start";
  }
}

// src/analysis/size-constraints.ts
function constraintsOf(n, declared, ctx, notes) {
  const result = {};
  if (n.styles.display === "inline" && !["img", "svg", "input", "select", "textarea", "button", "video", "audio", "canvas", "iframe", "embed", "object"].includes(n.tag))
    return result;
  const [pt, pr, pb, pl] = insetsOf(n.styles);
  const positioned = /^(absolute|fixed)$/.test(n.styles.position ?? "");
  const parentInsets = ctx.parent ? insetsOf(ctx.parent.styles) : undefined;
  const widthRef = ctx.parent && parentInsets && !positioned && ctx.parent.styles.display !== "inline" ? Math.max(0, ctx.parent.bounds.w - parentInsets[1] - parentInsets[3]) : undefined;
  for (const [property, key, vertical] of [
    ["min-width", "minWidth", false],
    ["max-width", "maxWidth", false],
    ["min-height", "minHeight", true],
    ["max-height", "maxHeight", true]
  ]) {
    const raw = n.styles[property] ?? declared[property];
    if (!raw || raw === "auto" || raw === "none" || property.startsWith("min-") && /^(0|0px|0%)$/.test(raw))
      continue;
    const insets = vertical ? pt + pb : pl + pr;
    const measured = vertical ? n.bounds.h : n.bounds.w;
    const relative = raw.includes("%");
    const unresolved = relative && (vertical || widthRef === undefined);
    const resolved = unresolved ? undefined : resolveLength(raw, widthRef ?? 0);
    if (resolved === undefined) {
      result[key] = round2(Math.max(insets, measured));
      notes.push(`approximated: ${property} ${raw} → captured border-box ${round2(measured)}px; ${unresolved ? "containing-block sizing is not established" : "intrinsic/complex constraint is not reconstructed"}`);
    } else {
      result[key] = round2(Math.max(insets, resolved + (n.styles["box-sizing"] === "border-box" ? 0 : insets)));
    }
  }
  if (result.minWidth !== undefined && result.maxWidth !== undefined)
    result.maxWidth = Math.max(result.minWidth, result.maxWidth);
  if (result.minHeight !== undefined && result.maxHeight !== undefined)
    result.maxHeight = Math.max(result.minHeight, result.maxHeight);
  return result;
}

// src/analysis/flex-sizing.ts
function inFlow(node) {
  return node.tag !== "#text" && node.styles.display !== "none" && node.styles.position !== "absolute" && node.styles.position !== "fixed";
}
function flexGrowthSize(n, axis, ctx, notes) {
  const parent = ctx.parent;
  if (!parent || ctx.parentAxis !== axis || !/flex/.test(ctx.parentDisplay ?? parent.styles.display ?? ""))
    return;
  if (!inFlow(n) || px(n.styles["flex-grow"]) <= 0)
    return;
  const growers = parent.children.filter((child) => inFlow(child) && px(child.styles["flex-grow"]) > 0);
  if (!growers.length)
    return;
  const factors = growers.map((child) => px(child.styles["flex-grow"]));
  const sizes = growers.map((child) => axis === "h" ? child.bounds.w : child.bounds.h);
  const total = factors.reduce((sum, grow) => sum + grow, 0);
  const equalFactors = factors.every((grow) => Math.abs(grow - factors[0]) < 0.000001);
  const equalSizes = Math.max(...sizes) - Math.min(...sizes) <= 1;
  if (total >= 1 && equalFactors && equalSizes)
    return { kind: "fill" };
  const dimension = axis === "h" ? "width" : "height";
  const reasons = [];
  if (total < 1)
    reasons.push(`flex-grow total ${total} < 1 leaves unused space`);
  if (!equalFactors)
    reasons.push(`unequal flex-grow factors [${factors.join(",")}]`);
  if (!equalSizes)
    reasons.push(`unequal measured ${dimension}s [${sizes.map(round2).join(",")}] (basis, shrink or content constraints)`);
  notes.push(`approximated: ${reasons.join("; ")}; measured ${dimension} pinned`);
  return { kind: "fixed", px: round2(axis === "h" ? n.bounds.w : n.bounds.h) };
}

// src/analysis/responsive-width.ts
function equalCalculatedFlexWidth(n, declared, ctx) {
  const match = /^calc\(\s*(\d+(?:\.\d+)?)%\s*([+-])\s*(\d+(?:\.\d+)?)px\s*\)$/.exec(declared.trim());
  const parent = ctx.parent;
  if (!match || !parent || ctx.parentAxis !== "h" || !/flex/.test(ctx.parentDisplay ?? ""))
    return false;
  if (!/^row$/.test(parent.styles["flex-direction"] ?? "row") || !/^(?:nowrap|none)$/.test(parent.styles["flex-wrap"] ?? "nowrap"))
    return false;
  if (parent.children.some((child) => child.tag === "#text" && child.text?.trim()))
    return false;
  const siblings = parent.children.filter((child) => child.tag !== "#text" && child.styles.display !== "none");
  if (siblings.length < 2 || !siblings.includes(n))
    return false;
  if (siblings.some((child) => child.preferredSize?.width !== declared || child.styles.position && child.styles.position !== "static" || child.styles.float && child.styles.float !== "none" || !/^(?:auto|0(?:px)?)$/.test(child.styles["min-width"] ?? "auto") || (child.styles["max-width"] ?? "none") !== "none" || (child.styles["flex-basis"] ?? "auto") !== "auto" || insetsOf(child.styles).some((inset) => inset !== 0) || ["flex-grow", "flex-shrink", "flex-basis"].some((property) => child.styles[property] !== n.styles[property]) || ["left", "right"].some((edge) => px(child.styles[`margin-${edge}`]) !== 0)))
    return false;
  const [, right, , left] = insetsOf(parent.styles);
  const available = parent.bounds.w - left - right;
  const fraction = Number(match[1]) / 100;
  const offset = Number(match[3]) * (match[2] === "-" ? -1 : 1);
  const gap = px(parent.styles["column-gap"] ?? parent.styles.gap);
  if (Math.abs(siblings.length * fraction - 1) > 0.000001 || Math.abs(siblings.length * offset + gap * (siblings.length - 1)) > 0.000001)
    return false;
  if (!(available > 0) || siblings.some((child) => Math.abs(child.bounds.w - (available * fraction + offset)) > 1))
    return false;
  return Math.abs(siblings.reduce((sum, child) => sum + child.bounds.w, 0) + gap * (siblings.length - 1) - available) <= 1;
}
function responsiveFraction(n, declared, ctx) {
  const match = /^(?:([0-9]+(?:\.[0-9]+)?)|(\.[0-9]+))%$/.exec(declared.trim());
  if (!match || !ctx.parent || ctx.parentDisplay !== "block" || ctx.parentAxis !== "v")
    return;
  const fraction = Number(match[1] ?? match[2]) / 100;
  if (!(fraction > 0 && fraction < 1))
    return;
  const parent = ctx.parent;
  if (n.styles.display !== "block" || parent.styles.display !== "block")
    return;
  if ([n, parent].some((box) => box.styles.direction === "rtl" || box.styles["writing-mode"] !== undefined && box.styles["writing-mode"] !== "horizontal-tb"))
    return;
  if (hasCapturedPaintGeometry(n))
    return;
  if (![n, parent].every((box) => {
    const s = box.styles;
    return (!s.position || s.position === "static") && (!s.float || s.float === "none") && (!s.transform || s.transform === "none") && (!s["min-width"] || /^(?:auto|0(?:px)?)$/.test(s["min-width"])) && (!s["max-width"] || s["max-width"] === "none") && insetsOf(s).every((inset) => inset === 0) && ["left", "right", "top", "bottom"].every((edge) => px(s[`margin-${edge}`]) === 0);
  }))
    return;
  if (parent.children.some((child) => child.tag === "#text" ? Boolean(child.text?.trim()) : child.styles.display !== "block" || child.styles.float && child.styles.float !== "none" || child.styles.position && child.styles.position !== "static"))
    return;
  if (Math.abs(n.bounds.w - parent.bounds.w * fraction) > 1)
    return;
  return fraction;
}
function hasCapturedPaintGeometry(n) {
  const s = n.styles;
  if (["svg", "img", "canvas", "video", "iframe", "object", "embed"].includes(n.tag))
    return true;
  if (["background-image", "mask-image", "clip-path", "box-shadow", "filter", "backdrop-filter"].some((property) => s[property] !== undefined && s[property] !== "none"))
    return true;
  if (["top-left", "top-right", "bottom-right", "bottom-left"].some((corner) => !zeroRadius(s[`border-${corner}-radius`])))
    return true;
  return n.children.some(hasCapturedPaintGeometry);
}
function zeroRadius(value) {
  return value === undefined || value.trim().split(/\s+/).every((part) => /^0(?:\.0+)?(?:px|%)?$/.test(part));
}

// src/analysis/table-width.ts
var tableWidths = new WeakMap;
var groups = new Set(["thead", "tbody", "tfoot"]);
var cells = new Set(["td", "th"]);
function hasEqualFixedTableWidth(root, node) {
  let indexed = tableWidths.get(root);
  if (!indexed) {
    indexed = new WeakSet;
    indexTables(root, undefined, indexed);
    tableWidths.set(root, indexed);
  }
  return indexed.has(node);
}
function indexTables(node, parent, indexed) {
  if (node.tag === "table") {
    const members = equalFixedTable(node, parent);
    if (members)
      for (const member of members)
        indexed.add(member);
  }
  for (const child of node.children)
    indexTables(child, node, indexed);
}
function equalFixedTable(table, parent) {
  if (table.styles["table-layout"] !== "fixed" || table.styles.display !== "table" || table.preferredSize?.width !== "100%" || parent && parent.styles.display !== "block" || !ordinary(table) || !unconstrained(table))
    return;
  if (parent) {
    const [, right, , left] = insetsOf(parent.styles);
    const available = parent.bounds.w - left - right;
    if (Math.abs(table.bounds.w - available) > 1)
      return;
  }
  const members = [table];
  const rows = [];
  for (const child of table.children) {
    if (child.tag === "tr")
      rows.push(child);
    else if (groups.has(child.tag) && ordinary(child) && autoWidth(child)) {
      members.push(child);
      if (!child.children.length || child.children.some((row) => row.tag !== "tr"))
        return;
      rows.push(...child.children);
    } else
      return;
  }
  if (!rows.length)
    return;
  let columns = 0;
  let edges;
  for (const row of rows) {
    if (!ordinary(row) || !autoWidth(row) || row.styles.display !== "table-row")
      return;
    const rowCells = row.children;
    if (rowCells.length < 2 || rowCells.some((cell) => !cells.has(cell.tag) || !ordinary(cell) || !autoWidth(cell) || cell.styles.display !== "table-cell" || cell.attrs.colspan !== undefined || cell.attrs.rowspan !== undefined || cell.attrs.width !== undefined || cell.styles["min-width"] !== undefined && !/^(?:auto|0(?:px)?)$/.test(cell.styles["min-width"]) || cell.styles["max-width"] !== undefined && cell.styles["max-width"] !== "none"))
      return;
    if (columns && rowCells.length !== columns)
      return;
    columns = rowCells.length;
    const share = row.bounds.w / columns;
    if (!(share > 0) || rowCells.some((cell) => Math.abs(cell.bounds.w - share) > 1))
      return;
    const currentEdges = rowCells.map((cell) => cell.bounds.x - row.bounds.x);
    if (edges && currentEdges.some((edge, i) => Math.abs(edge - edges[i]) > 1))
      return;
    edges = currentEdges;
    members.push(row, ...rowCells);
  }
  return members;
}
function autoWidth(node) {
  return (node.preferredSize?.width ?? "auto") === "auto" && node.attrs.width === undefined;
}
function ordinary(node) {
  const styles = node.styles;
  return (styles.position === undefined || styles.position === "static") && (styles.float === undefined || styles.float === "none") && (styles.direction === undefined || styles.direction === "ltr") && (styles["writing-mode"] === undefined || styles["writing-mode"] === "horizontal-tb") && (styles.transform === undefined || styles.transform === "none");
}
function unconstrained(node) {
  const styles = node.styles;
  return (styles["min-width"] === undefined || /^(?:auto|0(?:px)?)$/.test(styles["min-width"])) && (styles["max-width"] === undefined || styles["max-width"] === "none") && px(styles["margin-left"]) === 0 && px(styles["margin-right"]) === 0;
}

// src/analysis/sizing.ts
function trailingInset(n, height, padBottom) {
  if (height.kind !== "hug" || n.children.length === 0)
    return padBottom;
  if (n.tag === "svg")
    return padBottom;
  if (n.children.some((c) => c.tag === "#text" || c.tag === "br"))
    return padBottom;
  const ext = contentExtent(n, false);
  if (!ext)
    return padBottom;
  let inset = n.bounds.y + n.bounds.h - (ext.y + ext.h);
  const display = n.styles["display"] ?? "block";
  const row = /^row/.test(n.styles["flex-direction"] ?? "row");
  const verticalAlignment = row ? crossAlign(n, "h") : distributionOf(n.styles["justify-content"], display);
  if (/flex/.test(display) && (row ? verticalAlignment === "center" || verticalAlignment === "end" : verticalAlignment !== "start")) {
    const margins = contentExtent(n, true);
    const free = n.bounds.y + n.bounds.h - padBottom - (margins.y + margins.h);
    inset -= Math.max(0, free);
  }
  return round2(Math.max(padBottom, inset));
}
function contentExtent(n, margins) {
  const contentLeft = n.bounds.x + insetsOf(n.styles)[3];
  let r;
  for (const c of n.children) {
    const pos = c.styles["position"];
    if (pos === "absolute" || pos === "fixed")
      continue;
    if (c.tag !== "#text") {
      if (c.bounds.w === 0 && c.bounds.h === 0)
        continue;
      if (!renders(c) || hangsLeading(c.bounds, contentLeft))
        continue;
    }
    let box = c.bounds;
    if (margins) {
      const [mt, mr, mb, ml] = EDGES.map((e) => px(c.styles[`margin-${e}`]));
      box = { x: box.x - ml, y: box.y - mt, w: box.w + ml + mr, h: box.h + mt + mb };
    }
    r = r ? unionRect(r, box) : box;
  }
  return r;
}
function hugs(n, axis) {
  const [pt, pr, pb, pl] = insetsOf(n.styles);
  const textHost = n.children.length > 0 && n.children.every((c) => c.tag === "#text" || c.tag === "br" || isInlineText(c));
  const tol = axis === "v" && textHost ? Math.max(4, px(n.styles["line-height"])) : 1;
  for (const ext of [contentExtent(n, true), contentExtent(n, false)]) {
    const natural = axis === "h" ? (ext?.w ?? 0) + pl + pr : (ext?.h ?? 0) + pt + pb;
    if (Math.abs((axis === "h" ? n.bounds.w : n.bounds.h) - natural) <= tol)
      return true;
  }
  return false;
}
function sizeOf(n, d, ctx, notes) {
  const s = n.styles;
  const abs = s["position"] === "absolute" || s["position"] === "fixed";
  const declW = n.preferredSize?.width ?? d["width"];
  const declH = n.preferredSize?.height ?? d["height"];
  const hugsW = hugs(n, "h");
  let hugsH = hugs(n, "v");
  if (hugsH && /flex/.test(s["display"] ?? "") && /^row/.test(s["flex-direction"] ?? "row") && crossAlign(n, "h") === "stretch") {
    hugsH = n.children.some((c) => {
      if (c.tag === "#text" || c.tag === "br")
        return true;
      const pos = c.styles["position"];
      if (pos === "absolute" || pos === "fixed")
        return false;
      const self = c.styles["align-self"] ?? "auto";
      return self !== "auto" && self !== "normal" && self !== "stretch" || hugs(c, "v");
    });
  }
  let fillsW = false, fillsH = false;
  if (ctx.parent) {
    const [ppt, ppr, ppb, ppl] = insetsOf(ctx.parent.styles);
    const outerW = n.bounds.w + px(s["margin-left"]) + px(s["margin-right"]);
    const outerH = n.bounds.h + px(s["margin-top"]) + px(s["margin-bottom"]);
    fillsW = Math.abs(outerW - (ctx.parent.bounds.w - ppl - ppr)) <= 1;
    fillsH = Math.abs(outerH - (ctx.parent.bounds.h - ppt - ppb)) <= 1;
  }
  const measuredW = { kind: "fixed", px: round2(n.bounds.w) };
  const measuredH = { kind: "fixed", px: round2(n.bounds.h) };
  const growthW = flexGrowthSize(n, "h", ctx, notes);
  const growthH = flexGrowthSize(n, "v", ctx, notes);
  const fractionW = declW ? responsiveFraction(n, declW, ctx) : undefined;
  const sharedFlexW = declW ? equalCalculatedFlexWidth(n, declW, ctx) : false;
  let width;
  if (hasEqualFixedTableWidth(ctx.root, n))
    width = { kind: "fill" };
  else if (declW && /px$/.test(declW))
    width = measuredW;
  else if (declW === "100%")
    width = fillsW && !abs ? { kind: "fill" } : measuredW;
  else if (fractionW !== undefined)
    width = { kind: "fraction", value: fractionW, capturedPx: round2(n.bounds.w) };
  else if (sharedFlexW)
    width = { kind: "fill" };
  else if (declW?.includes("%"))
    width = measuredW;
  else if (growthW)
    width = growthW;
  else if (ctx.parentAxis === "v" && (ctx.parentDisplay === "block" || ctx.parentAlign === "stretch") && !/inline/.test(s["display"] ?? "") && !abs) {
    width = fillsW ? { kind: "fill" } : hugsW ? { kind: "hug" } : measuredW;
  } else if (hugsW || !ctx.parent)
    width = { kind: "hug" };
  else if (fillsW && !abs)
    width = { kind: "fill" };
  else
    width = measuredW;
  if (width.kind !== "fraction" && !sharedFlexW && declW?.includes("%") && declW !== "100%" && declW !== "0%") {
    notes.push(`approximated: width: ${declW} captured as ${round2(n.bounds.w)}px; generated view may not resize proportionally with its parent`);
  }
  let height;
  if (declH && /px$/.test(declH))
    height = measuredH;
  else if (declH === "100%")
    height = fillsH && !abs ? { kind: "fill" } : measuredH;
  else if (growthH)
    height = growthH;
  else if (ctx.parentAxis === "h" && ctx.parentAlign === "stretch" && !abs && fillsH)
    height = { kind: "fill" };
  else if (hugsH || !ctx.parent)
    height = { kind: "hug" };
  else
    height = measuredH;
  const constraints = constraintsOf(n, d, ctx, notes);
  let selfAlign;
  if (width.kind === "fill" && ctx.parentAxis === "v" && !abs) {
    const ml = px(s["margin-left"]);
    const mr = px(s["margin-right"]);
    if (ml + mr > 1) {
      constraints.maxWidth = Math.min(constraints.maxWidth ?? Number.POSITIVE_INFINITY, round2(n.bounds.w));
      if (Math.abs(ml - mr) <= 1)
        selfAlign = "center";
      else if (ml > mr)
        selfAlign = "end";
    }
  }
  return { width, height, ...constraints, ...selfAlign !== undefined ? { selfAlign } : {} };
}

// src/analysis/node-base.ts
function finish(node) {
  node.confidence = worst(node.notes);
  return node;
}
function worst(notes) {
  if (notes.some((s) => s.startsWith("unmapped")))
    return "unmapped";
  if (notes.some((s) => s.startsWith("approximated")))
    return "approximated";
  return "mapped";
}
function withBase(n, ctx, extra) {
  const base = makeBase(n, ctx, parseDeclared(n.attrs["style"]));
  return finish({ ...base, ...extra });
}
function makeBase(n, ctx, declared) {
  const notes = [];
  const policy = classifyElement(n.tag, n.attrs);
  if (policy.note)
    notes.push(policy.note);
  for (const custom of n.flattenedCustomElements ?? []) {
    notes.push(`approximated: <${custom.tag}>${custom.id ? ` #${custom.id}` : ""} display: contents wrapper has no box; custom semantics and behavior are not translated`);
  }
  const style = styleOf(n, notes);
  const { width, height, selfAlign, ...constraints } = sizeOf(n, declared, ctx, notes);
  const padding = insetsOf(n.styles);
  padding[2] = trailingInset(n, height, padding[2]);
  return {
    id: n.id ?? "",
    frame: n.bounds,
    width,
    height,
    ...constraints,
    ...selfAlign !== undefined ? { selfAlign } : {},
    padding,
    style,
    confidence: "mapped",
    notes,
    overlays: []
  };
}

// src/css/grid.ts
function resolvedGridTracks(value) {
  if (!value)
    return;
  const tokens = value.replace(/\[[^\]]*\]/g, " ").trim().split(/\s+/);
  const tracks = [];
  for (const token of tokens) {
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)px$/.test(token))
      return;
    const size = Number(token.slice(0, -2));
    if (!Number.isFinite(size))
      return;
    tracks.push(size);
  }
  return tracks.length ? tracks : undefined;
}

// src/analysis/measured-layout.ts
function measuredLayoutOf(base, children) {
  const [pt, pr, pb, pl] = base.padding;
  return {
    width: round2(Math.max(0, base.frame.w - pl - pr)),
    height: round2(Math.max(0, base.frame.h - pt - pb)),
    frames: children.map((child) => ({
      x: round2(child.frame.x - base.frame.x - pl),
      y: round2(child.frame.y - base.frame.y - pt),
      w: round2(child.frame.w),
      h: round2(child.frame.h)
    }))
  };
}

// src/analysis/grid.ts
function starts(tracks, gap, origin) {
  let at = origin;
  return tracks.map((size) => {
    const start = at;
    at += size + gap;
    return start;
  });
}
var near = (a, b) => Math.abs(a - b) <= 0.5;
function buildGrid(n, base, all) {
  base.padding = insetsOf(n.styles);
  const items = all.filter((item) => renders(item.node));
  const widths = resolvedGridTracks(n.styles["grid-template-columns"]);
  const heights = resolvedGridTracks(n.styles["grid-template-rows"]);
  const hSpacing = round2(px(n.styles["column-gap"]));
  const vSpacing = round2(px(n.styles["row-gap"]));
  const columns = widths?.length ?? Math.max(1, new Set(items.map((item) => round2(item.sem.frame.x))).size);
  const xs = starts(widths ?? [], hSpacing, base.frame.x + base.padding[3]);
  const ys = starts(heights ?? [], vSpacing, base.frame.y + base.padding[0]);
  const ordered = [...items].sort((a, b) => a.sem.frame.y - b.sem.frame.y || a.sem.frame.x - b.sem.frame.x);
  const regular = widths && heights && widths.every((w) => w > 0) && heights.every((h) => h > 0) && ordered.length >= columns && Math.ceil(ordered.length / columns) === heights.length && ordered.every((item, index) => {
    const row = Math.floor(index / columns), column = index % columns, f = item.sem.frame;
    return near(f.x, xs[column]) && near(f.y, ys[row]) && near(f.w, widths[column]) && near(f.h, heights[row]);
  });
  if (!regular || n.styles.direction === "rtl") {
    const children = [...items].sort((a, b) => (a.node.paint ?? 0) - (b.node.paint ?? 0)).map((item) => item.sem);
    for (const child of children) {
      child.width = { kind: "fixed", px: round2(child.frame.w) };
      child.height = { kind: "fixed", px: round2(child.frame.h) };
    }
    base.notes.push("approximated: captured grid placement preserves holes, spans and alignment; responsive track recalculation is not reconstructed");
    return { ...base, kind: "grid", columns, hSpacing, vSpacing, children, measured: measuredLayoutOf(base, children) };
  }
  const contentW = base.frame.w - base.padding[1] - base.padding[3];
  const equalFill = widths.every((w) => near(w, widths[0])) && near(widths.reduce((sum, w) => sum + w, 0) + (columns - 1) * hSpacing, contentW);
  const children = ordered.map((item) => {
    item.sem.width = equalFill ? { kind: "fill" } : { kind: "fixed", px: round2(item.sem.frame.w) };
    if (item.sem.height.kind === "fill")
      item.sem.height = { kind: "fixed", px: round2(item.sem.frame.h) };
    return item.sem;
  });
  base.notes.push("approximated: regular captured tracks mapped to native Grid; responsive track definitions are not reconstructed");
  return { ...base, kind: "grid", columns, hSpacing, vSpacing, children };
}

// src/analysis/text-layout.ts
var ASCENT_RATIO = 0.8;
function withInlineGaps(built, host) {
  const chains = built.map((b) => inlineChain(host, b.styleOf));
  const out = [];
  for (let i = 0;i < built.length; i++) {
    const b = built[i];
    const chain = chains[i];
    const lead = chain.filter((el) => !chains[i - 1]?.includes(el)).reduce((n, el) => n + inlineInset(el, "left"), 0);
    const trail = chain.filter((el) => !chains[i + 1]?.includes(el)).reduce((n, el) => n + inlineInset(el, "right"), 0);
    if (lead > 0)
      out.push(gapRun(b.run, lead));
    out.push(b.run);
    if (trail > 0)
      out.push(gapRun(b.run, trail));
  }
  return out;
}
function hostSpace(host, families) {
  const s = host.styles;
  const color = parseColor(s["-webkit-text-fill-color"]) ?? parseColor(s["color"]) ?? { r: 0, g: 0, b: 0, a: 1 };
  const run = { text: " ", font: fontOf(s, families), color };
  const deco = decorationOf(s, color);
  if (deco)
    run.decoration = deco;
  const node = { tag: "#text", attrs: {}, styles: s, bounds: { x: 0, y: 0, w: 0, h: 0 }, text: " ", children: [] };
  return { run, node, styleOf: host, src: [-1] };
}
function inlineInset(el, side) {
  return round2(px(el.styles[`padding-${side}`]) + edgeWidth(el.styles, side));
}
function gapRun(neighbour, gap) {
  return { text: "", font: neighbour.font, color: neighbour.color, gap };
}
function inlineChain(host, el) {
  const path = [];
  let cur = host;
  while (cur !== el) {
    const next = cur.children.find((c) => c === el || contains(c, el));
    if (!next)
      return path;
    path.push(next);
    cur = next;
  }
  return path;
}
function inlineFragments(el) {
  const frags = [];
  const collect = (n) => {
    if (n.tag === "#text") {
      if (n.lines?.length)
        for (const l of n.lines)
          frags.push(l.bounds);
      else if (n.bounds.w > 0)
        frags.push(n.bounds);
      return;
    }
    for (const c of n.children)
      collect(c);
  };
  collect(el);
  if (!frags.length)
    return [el.bounds];
  const lines = [];
  for (const f of frags.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = lines[lines.length - 1];
    if (last && f.y - last.y < Math.max(1, f.h / 2))
      lines[lines.length - 1] = unionRect(last, f);
    else
      lines.push({ ...f });
  }
  const [pt, pr, pb, pl] = insetsOf(el.styles);
  return lines.map((g, i) => ({
    x: i === 0 ? g.x - pl : g.x,
    y: g.y - pt,
    w: g.w + (i === 0 ? pl : 0) + (i === lines.length - 1 ? pr : 0),
    h: g.h + pt + pb
  }));
}
function trimRun(b, edge) {
  const text = b.run.text.replace(edge, "");
  const cut = b.run.text.length - text.length;
  if (!cut)
    return;
  b.run.text = text;
  if (edge.source.startsWith("^"))
    b.src.splice(0, cut);
  else
    b.src.length = b.src.length - cut;
}
function markLineBreaks(built) {
  let previousLine;
  let previousShift = 0;
  let explicitBreak = false;
  for (const b of built) {
    if (!/[^\s\u200b]/u.test(b.run.text)) {
      if (b.run.text.includes(`
`))
        explicitBreak = true;
      continue;
    }
    const boxes = b.node.lines ?? [{ bounds: b.node.bounds, start: 0, length: b.node.text?.length ?? 0 }];
    const ordered = [...boxes].sort((p, q) => p.bounds.y - q.bounds.y || p.bounds.x - q.bounds.x);
    const starts = [];
    let lineTop = -Infinity;
    for (const box of ordered) {
      if (Math.abs(box.bounds.y - lineTop) < Math.max(1, box.bounds.h / 2))
        continue;
      lineTop = box.bounds.y;
      starts.push(box);
    }
    const breaks = [];
    const first = starts[0]?.bounds;
    const shift = b.run.baselineOffset ?? 0;
    const baseline = first ? first.y + ASCENT_RATIO * first.h + shift : undefined;
    const previousBaseline = previousLine ? previousLine.y + ASCENT_RATIO * previousLine.h + previousShift : undefined;
    const tolerance = Math.max(2, (first?.h ?? 0) * 0.05, (previousLine?.h ?? 0) * 0.05);
    if (baseline !== undefined && previousBaseline !== undefined && baseline - previousBaseline >= tolerance && !explicitBreak && !/^[ \t]*\n/.test(b.run.text)) {
      const at = collapseOf(b.styleOf.styles) !== "preserve" && b.run.text.startsWith(" ") ? 1 : 0;
      if (at < b.run.text.length)
        breaks.push(at);
    }
    for (const box of starts.slice(1)) {
      const at = b.src.findIndex((i) => i >= box.start);
      if (at > 0 && b.run.text[at - 1] === `
`)
        continue;
      if (at > 0 && at < b.run.text.length && breaks[breaks.length - 1] !== at)
        breaks.push(at);
    }
    previousLine = starts[starts.length - 1]?.bounds ?? previousLine;
    previousShift = shift;
    explicitBreak = /\n[ \t\u200b]*$/.test(b.run.text);
    if (breaks.length)
      b.run.breaks = breaks;
  }
}
function markBaselineShifts(built, host, note) {
  const shifted = built.filter((b) => {
    const el = b.styleOf;
    const va = el.styles["vertical-align"];
    return el !== host && (va !== undefined && va !== "baseline" || el.tag === "sub" || el.tag === "sup");
  });
  if (!shifted.length)
    return;
  const hostSize = round2(px(host.styles["font-size"]));
  for (const b of shifted) {
    const ref = built.find((o) => o !== b && o.run.font.size === hostSize && o.node.bounds.y < b.node.bounds.y + b.node.bounds.h && b.node.bounds.y < o.node.bounds.y + o.node.bounds.h);
    if (!ref) {
      note("approximated: baseline-shifted run without unshifted text on its line → shift dropped");
      continue;
    }
    const a = ref.node.bounds;
    const s = b.node.bounds;
    const offset = round2(a.y + ASCENT_RATIO * a.h - (s.y + ASCENT_RATIO * s.h));
    if (Math.abs(offset) >= 0.5)
      b.run.baselineOffset = offset;
  }
}

// src/analysis/text-run-builder.ts
var NUMERIC_FEATURES = { normal: true, "tabular-nums": true };
function buildTextRuns(host, runs, ctx, note) {
  const out = [];
  const built = [];
  const painted = [];
  let union;
  let pendingSpace = false;
  let prevRun;
  for (const r of runs) {
    const s = r.styleOf.styles;
    for (const inline of inlineChain(host, r.styleOf))
      reportStaticMotion(inline.styles, note);
    const boundary = r.node.tag === "br" ? `
` : r.node.tag === "wbr" ? "​" : undefined;
    if (r.node.tag === "wbr")
      note("approximated: <wbr> → zero-width break opportunity; native line breaking may differ");
    const mode = boundary === undefined ? collapseOf(s) : "preserve";
    const normalized = normalizeWhitespace(boundary ?? (r.node.text ?? ""), mode);
    let text = normalized.text;
    let src = normalized.src;
    if (mode === "collapse") {
      const prev = out[out.length - 1];
      if (!text.trim()) {
        if (prev && !/\s$/.test(prev.text))
          pendingSpace = true;
        continue;
      }
      if (text.startsWith(" ") && (!prev || /\s$/.test(prev.text))) {
        text = text.slice(1);
        src = src.slice(1);
      }
      if (prev && prevRun && r.node.tag !== "br" && r.node.tag !== "wbr" && prevRun.node.tag !== "wbr" && !/\s$/.test(prev.text) && !text.startsWith(" ")) {
        const a = (prevRun.styleOf === host ? prevRun.node : prevRun.styleOf).bounds;
        const b = (r.styleOf === host ? r.node : r.styleOf).bounds;
        const sameLine = b.y < a.y + a.h - 1;
        if (!sameLine || b.x - (a.x + a.w) > 1.5)
          pendingSpace = true;
      }
    } else if (!text)
      continue;
    const color = parseColor(s["-webkit-text-fill-color"]) ?? parseColor(s["color"]) ?? { r: 0, g: 0, b: 0, a: 1 };
    const deco = decorationOf(s, color);
    if (pendingSpace && !text.startsWith(" ")) {
      if (deco && r.styleOf !== host) {
        const spaceRun = hostSpace(host, ctx.bundledFamilies);
        out.push(spaceRun.run);
        built.push(spaceRun);
      } else {
        text = " " + text;
        src = [-1, ...src];
      }
    }
    pendingSpace = false;
    prevRun = r;
    const run = { text, font: fontOf(s, ctx.bundledFamilies), color };
    const families = fontFamilies(s["font-family"]);
    const resolved = families.find((f) => ctx.bundledFamilies[f] ?? SYSTEM_DESIGNS[f.toLowerCase()]);
    const first = families[0];
    if (first !== undefined && !ctx.bundledFamilies[first] && !SYSTEM_DESIGNS[first.toLowerCase()]) {
      note(`approximated: font-family ${first} is a web font this run did not bundle → ${resolved === undefined ? "system default design" : `the fallback ${resolved} it names next`}; glyph advances differ from the reference`);
    } else if (resolved !== undefined && /^(cursive|fantasy)$/i.test(resolved)) {
      note(`approximated: generic font-family ${resolved.toLowerCase()} has no system design → default`);
    } else if (resolved !== undefined) {
      const design = SYSTEM_DESIGNS[resolved.toLowerCase()];
      if (design && design !== "default")
        note(`approximated: font-family ${resolved} → SwiftUI .${design} design; glyph shapes and advances are the Apple system face, not the one the reference browser resolved`);
    }
    const ls = s["letter-spacing"];
    if (ls && ls !== "normal")
      run.kerning = round2(px(ls));
    const tt = s["text-transform"];
    if (tt === "uppercase" || tt === "lowercase" || tt === "capitalize")
      run.transform = tt;
    if (/^(italic|oblique)/.test(s["font-style"] ?? ""))
      run.italic = true;
    if (deco)
      run.decoration = deco;
    const shadows = parseShadows(s["text-shadow"]);
    if (shadows[0])
      run.shadow = shadows[0];
    if (shadows.length > 1)
      note("approximated: multiple text-shadows → first only");
    const numeric = s["font-variant-numeric"] ?? "normal";
    if (/tabular-nums/.test(numeric))
      run.tabularNums = true;
    for (const v of numeric.split(/\s+/))
      if (v && !NUMERIC_FEATURES[v])
        note(`approximated: font-variant-numeric ${v} has no SwiftUI API → default figures`);
    if (r.styleOf.attrs["class"]?.includes("sc-interp"))
      run.bound = true;
    const paint = textPaintOf(r.styleOf, r.node.bounds);
    if (paint)
      run.paint = paint;
    const el = r.styleOf;
    if (el !== host && !painted.includes(el)) {
      const bg = parseColor(el.styles["background-color"]);
      if (bg && bg.a > 0 || EDGES.some((e) => edgeWidth(el.styles, e) > 0))
        painted.push(el);
    }
    const link = inlineChain(host, el).find((a) => a.tag === "a" && a.attrs["href"] !== undefined);
    if (link) {
      const href = link.attrs["href"];
      const destination = nativeExternalURL(href);
      if (destination)
        run.href = destination;
      else
        note(`approximated: inline <a href="${href}"> → styled text run, destination dropped (${linkDestinationLoss(href)})`);
      if (link.attrs["onclick"])
        note("approximated: inline link onclick handler requires an app action");
    }
    out.push(run);
    built.push({ run, node: r.node, styleOf: r.styleOf, src });
    union = union ? unionRect(union, r.node.bounds) : { ...r.node.bounds };
  }
  return { out, built, painted, union };
}

// src/analysis/text-node.ts
function finishTextNode(host, runs, base, leaf, constructed, note) {
  const { out, built, painted, union } = constructed;
  if (out[0] && collapseOf(runs[0].styleOf.styles) === "collapse")
    trimRun(built[0], /^\s+/);
  if (built.length && collapseOf(runs[runs.length - 1].styleOf.styles) === "collapse")
    trimRun(built[built.length - 1], /\s+$/);
  const frame = leaf ? host.bounds : union ?? host.bounds;
  const dir = host.styles["direction"] === "rtl" ? "rtl" : "ltr";
  const ta = host.styles["text-align"] ?? "start";
  const side = ta === "start" ? dir === "rtl" ? "right" : "left" : ta === "end" ? dir === "rtl" ? "left" : "right" : ta;
  const first = out[0]?.font;
  const lh = first?.lineHeight ?? (first ? first.size * 1.2 : 16);
  let lines = Math.max(1, Math.round((union?.h ?? frame.h) / lh));
  if (leaf)
    lines = Math.min(lines, Math.max(1, Math.round((frame.h - base.padding[0] - base.padding[2]) / lh)));
  if (leaf) {
    const [pt, pr, pb, pl] = base.padding;
    const surplus = round2(frame.h - pt - pb - lines * lh);
    const ai = /flex|-webkit-box/.test(host.styles["display"] ?? "") ? host.styles["align-items"] : undefined;
    if (surplus > 2 && ai !== "center") {
      base.padding = ai === "flex-end" || ai === "end" ? [pt + surplus, pr, pb, pl] : [pt, pr, pb + surplus, pl];
    }
  }
  if (leaf && base.height.kind === "fixed" && Math.abs(base.height.px - base.padding[0] - base.padding[2] - lines * lh) < 0.5) {
    base.height = { kind: "hug" };
  }
  markBaselineShifts(built, host, note);
  markLineBreaks(built);
  for (const el of painted) {
    const style = styleOf(el, []);
    const boxes = el.bounds.h > lh * 1.5 ? inlineFragments(el) : [el.bounds];
    boxes.forEach((b, i) => {
      const box = {
        id: el.id ? boxes.length > 1 ? `${el.id}#box${i}` : `${el.id}#box` : "",
        kind: "box",
        frame: b,
        width: { kind: "fixed", px: round2(b.w) },
        height: { kind: "fixed", px: round2(b.h) },
        padding: [0, 0, 0, 0],
        style,
        confidence: "mapped",
        notes: [],
        overlays: []
      };
      base.overlays.push({ node: finish(box), layer: "background", offset: [round2(b.x - frame.x), round2(b.y - frame.y)], covers: false });
    });
  }
  const node = {
    ...base,
    frame,
    kind: "text",
    sourceTag: host.tag,
    runs: withInlineGaps(built, host),
    align: ta === "center" || /flex/.test(host.styles["display"] ?? "") && host.styles["justify-content"] === "center" ? "center" : side === "right" ? "trailing" : "leading",
    lines
  };
  const clamp = parseInt(host.styles["-webkit-line-clamp"] ?? "", 10);
  if (Number.isFinite(clamp))
    node.lineLimit = clamp;
  else if (noWrap(host.styles)) {
    node.noWrap = true;
    node.lineLimit = 1 + out.reduce((n, r) => n + (r.text.match(/\n/g)?.length ?? 0) + (r.breaks?.length ?? 0), 0);
  }
  if (host.styles["text-overflow"] === "ellipsis")
    node.truncate = true;
  if (dir === "rtl")
    node.layoutDirection = "rtl";
  if (ta === "justify")
    note("approximated: text-align: justify → ragged right (SwiftUI Text cannot justify)");
  noteUnsupportedTextFlow(host, runs, note);
  const wm = host.styles["writing-mode"];
  if (wm && wm !== "horizontal-tb")
    note(`unmapped: writing-mode ${wm} → vertical text has no SwiftUI layout`);
  return finish(node);
}
function noteUnsupportedTextFlow(host, runs, note) {
  const indent = host.styles["text-indent"];
  if (indent && !/^[+-]?0+(?:\.0+)?(?:[a-z%]+)?(?:\s+(?:hanging|each-line))*$/i.test(indent.trim())) {
    note(`approximated: text-indent: ${indent} → first-line indentation is not emitted by SwiftUI Text`);
  }
  for (const styles of [host.styles, ...runs.map((run) => run.styleOf.styles)]) {
    const wordBreak = styles["word-break"];
    if (wordBreak && wordBreak !== "normal") {
      note(`approximated: word-break: ${wordBreak} → SwiftUI Text uses native line breaking; narrower-width reflow may differ`);
    }
    const overflowWrap = styles["overflow-wrap"];
    if (overflowWrap && overflowWrap !== "normal") {
      note(`approximated: overflow-wrap: ${overflowWrap} → SwiftUI Text uses native line breaking; narrower-width reflow may differ`);
    }
  }
}

// src/analysis/text.ts
function buildText(host, runs, ctx, leaf = false) {
  const base = leaf ? makeBase(host, ctx, parseDeclared(host.attrs["style"])) : { id: host.id ? `${host.id}#text` : "", frame: host.bounds, width: { kind: "hug" }, height: { kind: "hug" }, padding: [0, 0, 0, 0], style: { fills: [], shadows: [] }, confidence: "mapped", notes: [], overlays: [] };
  const notes = base.notes;
  const noted = {};
  const note = (s) => {
    if (!noted[s])
      notes.push(s);
    noted[s] = true;
  };
  return finishTextNode(host, runs, base, leaf, buildTextRuns(host, runs, ctx, note), note);
}

// src/analysis/infer-children.ts
function partitionChildren(n, ctx) {
  const flow = [];
  const abs = [];
  const runs = [];
  for (const c of n.children) {
    if (c.tag === "#text" || c.tag === "br" || c.tag === "wbr") {
      runs.push({ node: c, styleOf: n });
      continue;
    }
    if (isInlineText(c)) {
      collectRuns(c, runs);
      continue;
    }
    const pos = c.styles["position"];
    if (pos === "fixed" && n !== ctx.root)
      ctx.fixed.push(c);
    else if (pos === "absolute" || pos === "fixed")
      abs.push(c);
    else
      flow.push(c);
  }
  return { flow, abs, runs };
}

// src/analysis/flow-layout.ts
function liftClearedText(base, items, align, distribution) {
  for (const it of items) {
    const sem = it.sem;
    if (floating(it.node) || sem.kind !== "text" || sem.lineLimit !== undefined || sem.truncate)
      continue;
    const over = items.filter((f) => floating(f.node) && Math.min(f.sem.frame.x + f.sem.frame.w, sem.frame.x + sem.frame.w) - Math.max(f.sem.frame.x, sem.frame.x) > 1);
    const bounds = [];
    sem.runs.forEach((r, i) => {
      for (const b of r.breaks ?? [])
        bounds.push([i, b]);
    });
    const tops = lineTops(it.node);
    if (!over.length || !bounds.length || tops.length !== bounds.length + 1 || tops.length !== sem.lines)
      continue;
    const ends = Math.max(...over.map((f) => f.sem.frame.y + f.sem.frame.h + px(f.node.styles["margin-bottom"])));
    const cut = tops.findIndex((y, i) => i > 0 && y >= ends - 0.5);
    if (cut < 1)
      continue;
    const [ri, at] = bounds[cut - 1];
    const pitch = (tops[tops.length - 1] - tops[0]) / (tops.length - 1);
    const [pt, pr, pb, pl] = sem.padding;
    const split = sem.runs[ri];
    const head = { ...split, text: split.text.slice(0, split.text[at - 1] === " " ? at - 1 : at) };
    const inHead = (split.breaks ?? []).filter((b) => b < at);
    if (inHead.length)
      head.breaks = inHead;
    else
      delete head.breaks;
    const tail = { ...split, text: split.text.slice(at) };
    const inTail = (split.breaks ?? []).filter((b) => b > at).map((b) => b - at);
    if (inTail.length)
      tail.breaks = inTail;
    else
      delete tail.breaks;
    const headRuns = [...sem.runs.slice(0, ri), head];
    const tailRuns = [tail, ...sem.runs.slice(ri + 1)];
    const shapedH = round2(pt + cut * pitch);
    const shaped = { ...sem, runs: headRuns, frame: { ...sem.frame, h: shapedH }, padding: [pt, pr, 0, pl], lines: cut };
    const cleared = {
      ...sem,
      id: sem.id ? `${sem.id}#cleared` : "",
      runs: tailRuns,
      frame: { ...sem.frame, y: round2(sem.frame.y + shapedH), h: round2(sem.frame.h - shapedH) },
      padding: [0, pr, pb, pl],
      lines: tops.length - cut,
      notes: [...sem.notes],
      overlays: []
    };
    const rowItems = items.map((i) => i === it ? { node: i.node, sem: shaped } : i);
    const bottom = Math.max(...rowItems.map((i) => i.sem.frame.y + i.sem.frame.h));
    const rowBase = { ...base, id: base.id ? `${base.id}/beside` : "", frame: { ...base.frame, h: round2(bottom - base.frame.y) }, notes: [], overlays: [] };
    const row = finish(stackOf(rowBase, "h", rowItems, align, distribution));
    const outer = stackOf(base, "v", [{ node: it.node, sem: row }, { node: it.node, sem: cleared }], "stretch", "start");
    outer.notes.push("approximated: float → row plus the lines that clear it; re-wrapped at another width the split lands elsewhere");
    return outer;
  }
  return;
}
function stackOf(base, axis, all, align, distribution) {
  const [pt, , , pl] = base.padding;
  const items = all.filter((i) => renders(i.node) && !hangsLeading(i.sem.frame, base.frame.x + pl));
  if (axis === "h" && items.length > 1) {
    const lifted = liftClearedText(base, items, align, distribution);
    if (lifted)
      return lifted;
  }
  const gaps = [];
  for (let i = 1;i < items.length; i++) {
    const a = items[i - 1];
    const b = items[i];
    let g = axis === "h" ? b.sem.frame.x - (a.sem.frame.x + a.sem.frame.w) : b.sem.frame.y - (a.sem.frame.y + a.sem.frame.h);
    if (g < -0.5) {
      if (axis === "h" && a.node.styles["float"] === "left")
        g = Math.max(0, px(a.node.styles["margin-right"]));
      else if (axis === "h" && b.node.styles["float"] === "right")
        g = Math.max(0, px(b.node.styles["margin-left"]));
      else if (axis === "v" && px(b.node.styles["margin-top"]) < -0.5) {} else {
        base.notes.push(`approximated: children overlap by ${round2(-g)}px`);
        g = 0;
      }
    } else
      g = Math.max(0, g);
    gaps.push(round2(g));
  }
  const uniform = gaps.every((g) => Math.abs(g - (gaps[0] ?? 0)) <= 0.5);
  const spacing = uniform ? round2(gaps[0] ?? 0) : gaps;
  if (axis === "h" && items.length > 1 && items.some((i) => floating(i.node))) {
    let taken = 0;
    items.forEach((it, i) => {
      if (floating(it.node))
        taken += it.sem.frame.w + (i > 0 ? gaps[i - 1] ?? 0 : gaps[i] ?? 0);
    });
    const band = round2(base.frame.w - base.padding[1] - pl - taken);
    for (const it of items) {
      if (floating(it.node) || it.sem.width.kind !== "fill" || band <= 0 || band >= it.sem.frame.w)
        continue;
      const shaped = items.some((f) => floating(f.node) && Math.min(f.sem.frame.x + f.sem.frame.w, it.sem.frame.x + it.sem.frame.w) - Math.max(f.sem.frame.x, it.sem.frame.x) > 1);
      if (shaped)
        it.sem.frame = { ...it.sem.frame, w: band };
    }
  }
  if (axis === "h") {
    for (const it of items)
      if (it.sem.width.kind === "hug" && fillsWidthInside(it.sem))
        it.sem.width = { kind: "fixed", px: round2(it.sem.frame.w) };
  }
  let leadInset = 0;
  if (items[0]) {
    const f = items[0].sem.frame;
    leadInset = round2(axis === "h" ? f.x - (base.frame.x + pl) : f.y - (base.frame.y + pt));
    if (Math.abs(leadInset) < 0.5)
      leadInset = 0;
  }
  if (distribution === "center" || distribution === "end" || distribution === "between")
    leadInset = 0;
  return { ...base, kind: "stack", axis, spacing, align, distribution, leadInset, children: items.map((i) => i.sem) };
}
function linesOf(all) {
  const lines = [];
  let top = 0;
  let bottom = 0;
  for (const it of all.filter((i) => renders(i.node)).sort((a, b) => a.sem.frame.y - b.sem.frame.y)) {
    const f = it.sem.frame;
    const line = lines[lines.length - 1];
    const overlap = Math.min(bottom, f.y + f.h) - Math.max(top, f.y);
    const clear = !line || floating(it.node) || line.every((o) => floating(o.node) || f.x >= o.sem.frame.x + o.sem.frame.w - 1 || f.x + f.w <= o.sem.frame.x + 1);
    if (line && clear && overlap > 1 && overlap >= Math.min(f.h, bottom - top) / 2) {
      line.push(it);
      bottom = Math.max(bottom, f.y + f.h);
    } else {
      lines.push([it]);
      top = f.y;
      bottom = f.y + f.h;
    }
  }
  for (const l of lines)
    l.sort((a, b) => a.sem.frame.x - b.sem.frame.x);
  return lines;
}

// src/analysis/wrapping.ts
function gap(value) {
  if (!value || value === "normal")
    return 0;
  return /^(?:0|\d*\.?\d+px)$/.test(value) ? Math.max(0, px(value)) : undefined;
}
function unsupported(n, base, items, axis, align, distribution, columnGap, rowGap) {
  const direction = n.styles["flex-direction"] ?? "row";
  if (axis !== "h" || direction !== "row")
    return `${direction} wrapping`;
  if (n.styles["flex-wrap"] !== "wrap")
    return "wrap-reverse";
  if (n.styles.direction === "rtl")
    return "RTL wrapping";
  if (!["start", "center", "end"].includes(distribution))
    return `justify-content ${n.styles["justify-content"]}`;
  if (!["start", "center", "end", "stretch"].includes(align))
    return `align-items ${n.styles["align-items"]}`;
  if (columnGap === undefined || rowGap === undefined)
    return "relative or complex row/column gaps";
  for (const item of items) {
    const s = item.node.styles;
    if (px(s["flex-grow"]) > 0 || px(s["flex-shrink"] ?? "1") > 0)
      return "flex grow/shrink allocation";
    if (align === "stretch") {
      const declaredHeight = item.node.preferredSize?.height ?? parseDeclared(item.node.attrs.style)["height"];
      const [pt, , pb] = insetsOf(s);
      const wanted = declaredHeight && /^(?:0|\d*\.?\d+px)$/.test(declaredHeight) ? resolveLength(declaredHeight, 0) : undefined;
      if (wanted === undefined || Math.abs(item.sem.frame.h - wanted - (s["box-sizing"] === "border-box" ? 0 : pt + pb)) > 1)
        return "stretch-dependent child heights";
    }
    if (item.sem.width.kind !== "fixed" || item.sem.height.kind !== "fixed")
      return "intrinsic or filling child sizes";
    if (EDGES.some((edge) => s[`margin-${edge}`] === "auto" || Math.abs(px(s[`margin-${edge}`])) > 0.5))
      return "child margins";
    if (![undefined, "", "auto", "normal"].includes(s["align-self"]))
      return `align-self ${s["align-self"]}`;
    if (px(s.order) !== 0)
      return "CSS order allocation";
    const preferred = item.node.preferredSize?.width ?? parseDeclared(item.node.attrs.style)["width"];
    const basis = s["flex-basis"];
    const mainSize = basis && basis !== "auto" && basis !== "content" ? basis : preferred;
    if (mainSize && mainSize !== "auto" && !/^(?:0|\d*\.?\d+px)$/.test(mainSize))
      return "relative or intrinsic child width";
  }
  const lines = linesOf(items);
  const rows = lines.map((line) => line.map((item) => item.sem.frame).reduce(unionRect));
  const contentWidth = Math.max(0, base.frame.w - base.padding[1] - base.padding[3]);
  const nativeLines = [];
  let nativeLine = [], usedWidth = 0;
  for (const item of lines.flat()) {
    const next = usedWidth + (nativeLine.length ? columnGap : 0) + item.sem.frame.w;
    if (nativeLine.length && next > contentWidth + 0.0001) {
      nativeLines.push(nativeLine);
      nativeLine = [];
      usedWidth = 0;
    }
    usedWidth += (nativeLine.length ? columnGap : 0) + item.sem.frame.w;
    nativeLine.push(item);
  }
  if (nativeLine.length)
    nativeLines.push(nativeLine);
  if (nativeLines.length !== lines.length || nativeLines.some((line, index) => line.length !== lines[index].length))
    return "ambiguous main-axis wrapping";
  const naturalHeight = rows.reduce((sum, row) => sum + row.h, 0) + Math.max(0, rows.length - 1) * rowGap;
  const contentHeight = Math.max(0, base.frame.h - base.padding[0] - base.padding[2]);
  const alignContent = n.styles["align-content"] ?? "normal";
  const preferredHeight = n.preferredSize?.height ?? parseDeclared(n.attrs.style)["height"];
  const boundedHeight = base.height.kind !== "hug" || base.minHeight !== undefined || base.maxHeight !== undefined || preferredHeight !== undefined && preferredHeight !== "auto";
  if ((boundedHeight || Math.abs(contentHeight - naturalHeight) > 1) && alignContent !== "start" && alignContent !== "flex-start")
    return `align-content ${alignContent} in a non-hugging host`;
  let y = base.frame.y + base.padding[0];
  for (const [index, row] of rows.entries()) {
    if (Math.abs(row.y - y) > 1)
      return "ambiguous cross-row placement";
    const line = lines[index];
    const width = line.reduce((sum, item) => sum + item.sem.frame.w, 0) + Math.max(0, line.length - 1) * columnGap;
    let x = base.frame.x + base.padding[3] + (distribution === "center" ? (contentWidth - width) / 2 : distribution === "end" ? contentWidth - width : 0);
    for (const item of line) {
      const top = y + (align === "center" ? (row.h - item.sem.frame.h) / 2 : align === "end" ? row.h - item.sem.frame.h : 0);
      if (Math.abs(item.sem.frame.x - x) > 1 || Math.abs(item.sem.frame.y - top) > 1)
        return "ambiguous child alignment";
      x += item.sem.frame.w + columnGap;
    }
    y += row.h + rowGap;
  }
  return;
}
function buildWrapping(n, base, all, axis, align, distribution) {
  const plain = { ...base, padding: insetsOf(n.styles) };
  const items = all.filter((item) => renders(item.node));
  const columnGap = gap(n.styles["column-gap"]), rowGap = gap(n.styles["row-gap"]);
  const reason = unsupported(n, plain, items, axis, align, distribution, columnGap, rowGap);
  const ordered = reason ? [...items].sort((a, b) => (a.node.paint ?? 0) - (b.node.paint ?? 0)) : linesOf(items).flat();
  const stack = { ...plain, kind: "stack", axis, align, distribution, spacing: columnGap ?? 0, leadInset: 0, children: ordered.map((item) => item.sem) };
  if (reason) {
    stack.measured = measuredLayoutOf(plain, stack.children);
    stack.notes.push(`approximated: flex-wrap ${reason} → captured child positions; cannot reflow at another size`);
  } else {
    stack.wrap = { columnGap: round2(columnGap), rowGap: round2(rowGap) };
  }
  return stack;
}

// src/analysis/infer-flow.ts
function buildFlowStack(n, base, items, axis, display) {
  const notes = base.notes;
  const align = crossAlign(n, axis);
  const distribution = distributionOf(n.styles["justify-content"], display);
  const wraps = /flex/.test(display) && /^(wrap|wrap-reverse)$/.test(n.styles["flex-wrap"] ?? "");
  const lines = axis === "h" ? [[...items].sort((a, b) => a.sem.frame.x - b.sem.frame.x)] : linesOf(items);
  let stack;
  const multi = lines.some((l) => l.length > 1);
  if (wraps) {
    stack = buildWrapping(n, base, items, axis, align, distribution);
  } else if (multi && lines.length === 1 && axis === "v") {
    if (lines[0].some((i) => /^(left|right)$/.test(i.node.styles["float"] ?? "")))
      notes.push("approximated: float → side-by-side row; text does not wrap around it");
    stack = stackOf(base, "h", lines[0], "start", "start");
  } else if (multi && lines.length > 1) {
    const floats = items.filter((i) => /^(left|right)$/.test(i.node.styles["float"] ?? ""));
    if (floats.length)
      notes.push("approximated: float → side-by-side row; text does not wrap around it");
    const rows = lines.map((line, i) => {
      if (line.length === 1)
        return line[0];
      const u = line.map((it) => it.sem.frame).reduce(unionRect);
      const rowBase = {
        id: base.id ? `${base.id}/row${i}` : "",
        frame: { x: n.bounds.x + base.padding[3], y: u.y, w: n.bounds.w - base.padding[1] - base.padding[3], h: u.h },
        width: { kind: "fill" },
        height: { kind: "hug" },
        padding: [0, 0, 0, 0],
        style: { fills: [], shadows: [] },
        confidence: "mapped",
        notes: [],
        overlays: []
      };
      const row = finish(stackOf(rowBase, "h", line, "start", "start"));
      return { node: n, sem: row };
    });
    stack = stackOf(base, "v", rows, "stretch", "start");
  } else {
    stack = stackOf(base, axis, lines.flat(), align, distribution);
  }
  const items2 = stack.children;
  const oy = n.styles["overflow-y"];
  const ox = n.styles["overflow-x"];
  if (oy === "auto" || oy === "scroll") {
    const contentBottom = Math.max(...items2.map((i) => i.frame.y + i.frame.h), n.bounds.y);
    if (contentBottom > n.bounds.y + n.bounds.h + 0.5 || oy === "scroll")
      stack.scroll = "v";
  }
  if (!stack.scroll && (ox === "auto" || ox === "scroll")) {
    const contentRight = Math.max(...items2.map((i) => i.frame.x + i.frame.w), n.bounds.x);
    if (contentRight > n.bounds.x + n.bounds.w + 0.5 || ox === "scroll")
      stack.scroll = "h";
  }
  return stack;
}

// src/analysis/infer-overlays.ts
function buildOverlays(host, abs, firstFlow, ctx, build) {
  const out = [];
  const flowPaint = firstFlow?.paint ?? Number.POSITIVE_INFINITY;
  for (const c of [...abs].sort((a, b) => (a.paint ?? 0) - (b.paint ?? 0))) {
    const sem = build(c, { root: ctx.root, fixed: ctx.fixed, bundledFamilies: ctx.bundledFamilies, parent: host });
    const covers = Math.abs(c.bounds.x - host.bounds.x) < 0.5 && Math.abs(c.bounds.y - host.bounds.y) < 0.5 && Math.abs(c.bounds.w - host.bounds.w) < 0.5 && Math.abs(c.bounds.h - host.bounds.h) < 0.5;
    if (covers) {
      sem.width = { kind: "fill" };
      sem.height = { kind: "fill" };
    } else {
      sem.width = { kind: "fixed", px: round2(c.bounds.w) };
      sem.height = { kind: "fixed", px: round2(c.bounds.h) };
    }
    out.push({
      node: sem,
      layer: (c.paint ?? 0) < flowPaint ? "background" : "overlay",
      offset: [round2(c.bounds.x - host.bounds.x), round2(c.bounds.y - host.bounds.y)],
      covers
    });
  }
  const contentLeft = host.bounds.x + insetsOf(host.styles)[3];
  for (const c of host.children) {
    if (c.tag === "#text" || c.tag === "br" || !renders(c) || isInlineText(c))
      continue;
    const pos = c.styles["position"];
    if (pos === "absolute" || pos === "fixed" || !hangsLeading(c.bounds, contentLeft))
      continue;
    out.push({
      node: build(c, { root: ctx.root, fixed: ctx.fixed, bundledFamilies: ctx.bundledFamilies, parent: host }),
      layer: "overlay",
      offset: [round2(c.bounds.x - host.bounds.x), round2(c.bounds.y - host.bounds.y)],
      covers: false
    });
  }
  return out;
}

// src/analysis/infer-node.ts
function build(n, ctx) {
  const policy = classifyElement(n.tag, n.attrs);
  if (policy.route === "svg")
    return finish(buildSvg(n, makeBase(n, ctx, parseDeclared(n.attrs["style"])), ctx.root, ctx.bundledFamilies));
  if (policy.route === "image") {
    const fit = n.styles["object-fit"] ?? "fill";
    const position = n.styles["object-position"] ?? "50% 50%";
    const src = n.tag === "video" ? n.attrs["poster"] ?? "" : n.attrs["data-h2s-src"] ?? n.attrs["src"] ?? "";
    const anchor = objectPosition(position);
    const intrinsic = anchor && (anchor[0] !== 0.5 || anchor[1] !== 0.5) && (fit === "cover" || fit === "contain") ? imageSize(src) : undefined;
    const image = withBase(n, ctx, {
      kind: "image",
      src,
      contentMode: fit === "cover" ? "fill" : fit === "contain" || fit === "scale-down" ? "fit" : fit === "none" ? "none" : "stretch",
      ...intrinsic && intrinsic.w > 0 && intrinsic.h > 0 ? { intrinsicSize: [intrinsic.w, intrinsic.h] } : {},
      ...n.attrs["alt"] ? { alt: n.attrs["alt"], font: fontOf(n.styles, ctx.bundledFamilies), ...parseColor(n.styles["color"]) ? { color: parseColor(n.styles["color"]) } : {} } : n.attrs["alt"] !== undefined ? { alt: n.attrs["alt"] } : {}
    });
    if (fit === "scale-down")
      image.notes.push("approximated: object-fit: scale-down → contain; native intrinsic image size is unknown");
    if (fit === "none")
      image.notes.push("approximated: object-fit: none → unscaled native image; asset pixel scale may differ from browser CSS pixels");
    if (fit !== "fill" && (anchor === undefined || anchor[0] !== 0.5 || anchor[1] !== 0.5)) {
      if (anchor && intrinsic && intrinsic.w > 0 && intrinsic.h > 0 && (fit === "cover" || fit === "contain"))
        image.objectPosition = anchor;
      else
        image.notes.push(`approximated: object-position: ${position} → centered image content; ${!anchor ? "position syntax unsupported" : fit !== "cover" && fit !== "contain" ? "object-fit mode unsupported" : "intrinsic image size unavailable"}`);
    }
    return finish(image);
  }
  const { flow, abs, runs } = partitionChildren(n, ctx);
  if (policy.route === "placeholder" && !(n.tag === "object" && n.children.length)) {
    const box = withBase(n, ctx, { kind: "box" });
    box.overlays = buildOverlays(n, abs, undefined, ctx, build);
    return finish(box);
  }
  const spec = policy.route === "control" ? controlOf(n) : undefined;
  if (spec) {
    const childAxis = /flex/.test(n.styles["display"] ?? "block") && /^row/.test(n.styles["flex-direction"] ?? "row") ? "h" : "v";
    const childCtx = { ...ctx, parent: n, parentAxis: childAxis, parentDisplay: n.styles["display"] ?? "block", parentAlign: crossAlign(n, childAxis) };
    const node = buildControl(spec, {
      base: makeBase(n, ctx, parseDeclared(n.attrs["style"])),
      children: flow.map((c) => ({ node: c, sem: build(c, childCtx) })),
      texts: runs.length ? groupRuns(n, runs).map((g) => buildText(n, g, childCtx)).filter((t) => t.runs.length > 0) : [],
      font: fontOf(n.styles, ctx.bundledFamilies),
      ...parseColor(n.styles["color"]) ? { color: parseColor(n.styles["color"]) } : {}
    });
    node.overlays = buildOverlays(n, abs, flow[0], ctx, build);
    return finish(node);
  }
  if (flow.length === 0 && runs.length > 0) {
    const t = buildText(n, runs, ctx, true);
    if (t.runs.length > 0) {
      t.overlays.push(...buildOverlays(n, abs, undefined, ctx, build));
      return t;
    }
  }
  if (flow.length === 0) {
    const box = withBase(n, ctx, { kind: "box" });
    box.overlays = buildOverlays(n, abs, undefined, ctx, build);
    return box;
  }
  const display = n.styles["display"] ?? "block";
  const axis = /flex/.test(display) && /^row/.test(n.styles["flex-direction"] ?? "row") ? "h" : "v";
  const declared = parseDeclared(n.attrs["style"]);
  const items = [];
  const childCtx = { ...ctx, parent: n, parentAxis: axis, parentDisplay: display, parentAlign: crossAlign(n, axis) };
  for (const c of flow)
    items.push({ node: c, sem: build(c, childCtx) });
  if (runs.length) {
    const groups = groupRuns(n, runs);
    for (const g of groups) {
      const t = buildText(n, g, childCtx);
      if (t.runs.length === 0)
        continue;
      items.push({ node: { ...n, bounds: t.frame, children: [] }, sem: t });
    }
  }
  const base = makeBase(n, ctx, declared);
  if (display === "grid" || display === "inline-grid") {
    const grid = buildGrid(n, base, items);
    grid.overlays = buildOverlays(n, abs, flow[0], ctx, build);
    return finish(grid);
  }
  const stack = buildFlowStack(n, base, items, axis, display);
  stack.overlays = buildOverlays(n, abs, flow[0], ctx, build);
  return finish(stack);
}
function objectPosition(value) {
  const tokens = value.trim().toLowerCase().split(/\s+/);
  if (!tokens.length || tokens.length > 2)
    return;
  const x = (token) => token === "left" ? 0 : token === "right" ? 1 : token === "center" ? 0.5 : percent(token);
  const y = (token) => token === "top" ? 0 : token === "bottom" ? 1 : token === "center" ? 0.5 : percent(token);
  if (tokens.length === 1) {
    const token = tokens[0];
    if (token === "top" || token === "bottom")
      return [0.5, y(token)];
    const horizontal = x(token);
    return horizontal === undefined ? undefined : [horizontal, 0.5];
  }
  const [first, second] = tokens;
  const verticalFirst = first === "top" || first === "bottom" || second === "left" || second === "right";
  const horizontal = x(verticalFirst ? second : first);
  const vertical = y(verticalFirst ? first : second);
  return horizontal === undefined || vertical === undefined ? undefined : [horizontal, vertical];
}
function percent(value) {
  return /^-?(?:\d+\.?\d*|\.\d+)%$/.test(value) ? Number.parseFloat(value) / 100 : undefined;
}

// src/analysis/infer.ts
function inferScreen(doc, name, options = {}) {
  const ctx = { root: doc.root, fixed: [], bundledFamilies: options.bundledFamilies ?? {} };
  const root = build(doc.root, ctx);
  root.width = { kind: "fill" };
  root.height = { kind: "fill" };
  if (ctx.fixed.length)
    root.overlays.push(...buildOverlays(doc.root, ctx.fixed, undefined, ctx, build));
  const canvas = parseColor(doc.canvas) ?? { r: 1, g: 1, b: 1, a: 1 };
  return { version: 1, name, source: doc.source, theme: doc.combo.theme, size: doc.size, canvas, root };
}

// src/swift/format.ts
class Writer {
  lines = [];
  depth = 0;
  line(s = "") {
    this.lines.push(s ? "    ".repeat(this.depth) + s : "");
  }
  block(open, body, close = "}") {
    this.line(open);
    this.depth++;
    body();
    this.depth--;
    this.line(close);
  }
  toString() {
    return this.lines.join(`
`) + `
`;
  }
}
function colorArgs(c) {
  return `${num3(c.r)}, ${num3(c.g)}, ${num3(c.b)}${c.a < 1 ? `, ${num3(c.a)}` : ""}`;
}
function colorExpr(c, ctx, id) {
  const token = ctx.tokens?.name(c, id);
  return token ? `Color.${token}` : `Color.markswift(${colorArgs(c)})`;
}
function num3(v) {
  if (!Number.isFinite(v))
    return "0";
  const s = (Math.round(v * 1000) / 1000).toString();
  return s.includes(".") || s.includes("e") ? s : s + ".0";
}
function str(s) {
  return JSON.stringify(s);
}
function indent(lines, n) {
  return lines.map((l) => l ? "    ".repeat(n) + l : l);
}
var WEIGHT_NAMES = [
  [100, "ultraLight"],
  [200, "thin"],
  [300, "light"],
  [400, "regular"],
  [500, "medium"],
  [600, "semibold"],
  [700, "bold"],
  [800, "heavy"],
  [900, "black"]
];
var TEXT_STYLE_SIZES = [
  [34, "largeTitle"],
  [28, "title"],
  [22, "title2"],
  [20, "title3"],
  [17, "body"],
  [16, "callout"],
  [15, "subheadline"],
  [13, "footnote"],
  [12, "caption"],
  [11, "caption2"]
];
function fontExpr(f, ctx) {
  const weightName = WEIGHT_NAMES.reduce((best, [w, name]) => Math.abs(w - f.weight) < Math.abs(best[0] - f.weight) ? [w, name] : best)[1];
  if (f.family.kind === "custom") {
    if (ctx.mode === "fidelity")
      return `.markswiftVariable(${str(f.family.name)}, size: ${num3(f.size)}, weight: ${num3(f.weight)}${f.opsz !== undefined ? `, opsz: ${num3(f.opsz)}` : ""})`;
    const style = TEXT_STYLE_SIZES.reduce((best, [s, name]) => Math.abs(s - f.size) < Math.abs(best[0] - f.size) ? [s, name] : best)[1];
    return `.custom(${str(f.family.name)}, size: ${num3(f.size)}, relativeTo: .${style}).weight(.${weightName})`;
  }
  return `.system(size: ${num3(f.size)}, weight: .${weightName}, design: .${f.family.design})`;
}
function hash(s) {
  let h = 2166136261;
  for (let i = 0;i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// src/model/semantic.ts
function walk(n, fn, depth = 0) {
  fn(n, depth);
  for (const o of n.overlays)
    walk(o.node, fn, depth + 1);
  if (n.kind === "stack" || n.kind === "grid")
    for (const c of n.children)
      walk(c, fn, depth + 1);
  if (n.kind === "control") {
    if (n.label)
      walk(n.label, fn, depth + 1);
    for (const c of n.content)
      walk(c, fn, depth + 1);
  }
}

// src/swift/control-state.ts
function stateDecl(n) {
  if (n.files)
    return { type: "Bool", value: "false", suffix: "_presented" };
  switch (n.control) {
    case "textField":
    case "secureField":
    case "textEditor":
    case "picker":
      return { type: "String", value: str(n.value ?? "") };
    case "toggle":
    case "radio":
      return { type: "Bool", value: n.checked ? "true" : "false" };
    case "disclosure":
      return { type: "Bool", value: n.expanded ? "true" : "false" };
    case "slider":
    case "stepper":
      return { type: "Double", value: num3(numericValue(n)) };
    case "datePicker":
      return { type: "Date", value: ".now" };
    case "colorPicker": {
      const c = (n.value ? parseColor(n.value) : undefined) ?? { r: 0, g: 0, b: 0, a: 1 };
      return { type: "Color", value: `.markswift(${colorArgs(c)})` };
    }
    default:
      return;
  }
}
function controlMembers(root) {
  const stateOf = new Map;
  const actionOf = new Map;
  const decls = [];
  const seen = {};
  walk(root, (n) => {
    if (n.kind !== "control")
      return;
    const decl = stateDecl(n);
    if (decl) {
      const base = `s_${n.id.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "control"}${decl.suffix ?? ""}`;
      const k = seen[base] = (seen[base] ?? 0) + 1;
      const name = k === 1 ? base : `${base}_r${k}`;
      stateOf.set(n, name);
      decls.push(`@State private var ${name}: ${decl.type} = ${decl.value}`);
    }
    if (n.action !== undefined && !actionOf.has(n.action)) {
      const base = `on_${n.action.replace(/\(.*$/s, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "action"}`;
      const k = seen[base] = (seen[base] ?? 0) + 1;
      const name = k === 1 ? base : `${base}_r${k}`;
      actionOf.set(n.action, name);
      const target = n.control === "link" && n.action.startsWith("#") ? n.action.slice(1) : undefined;
      decls.push(target !== undefined ? `/// \`<a href="${oneLine(n.href ?? "")}">\` → \`${oneLine(target)}\` in the design: in-page navigation; fill in the destination.` : `/// \`onclick="${oneLine(n.action)}"\` in the design.`);
      decls.push(`var ${name}: () -> Void = {}`);
    }
  });
  return { decls, stateOf, actionOf };
}
function numericValue(n) {
  const r = n.range ?? { min: 0, max: 100 };
  const v = Number(n.value ?? "");
  return Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : r.min;
}
function oneLine(s) {
  return s.replace(/\s+/g, " ").trim();
}

// src/swift/svg.ts
var import_svgpath3 = __toESM(require_svgpath(), 1);
function svgExpr(n, shapes, ctx, id) {
  const [, , vw, vh] = n.viewBox;
  const scale = vw > 0 && vh > 0 ? n.stretch ? n.frame.w / vw : Math.min(n.frame.w / vw, n.frame.h / vh) : 1;
  const cw = n.stretch ? n.frame.w : vw * scale, ch = n.stretch ? n.frame.h : vh * scale;
  const view = { vb: n.viewBox, scale, offset: [(n.frame.w - cw) / 2, (n.frame.h - ch) / 2], shapes, ctx, id };
  const layers = n.paths.flatMap((p) => layerLines(p, view));
  for (const t of n.texts ?? [])
    layers.push(textLine(t, view));
  const out = layers.length === 0 ? ["Color.clear"] : layers.length === 1 ? [layers[0]] : ["ZStack {", ...indent(layers, 1), "}"];
  if (Math.abs(cw - n.frame.w) > 0.01 || Math.abs(ch - n.frame.h) > 0.01)
    out.push(`.frame(width: ${num3(cw)}, height: ${num3(ch)})`);
  if (n.label)
    out.push(`.accessibilityLabel(${str(n.label)})`);
  return out;
}
function layerLines(p, view) {
  const { scale, vb } = view;
  const [, , vw] = vb;
  if (p.ring) {
    const inset = (vw / 2 - p.ring.r) * scale;
    const lw = (p.strokeWidth ?? 1) * scale;
    const box = [vb[0] + vw / 2 - p.ring.r, vb[1] + vb[3] / 2 - p.ring.r, 2 * p.ring.r, 2 * p.ring.r];
    const paint = p.strokeGradient ? gradientExpr(p.strokeGradient, box, view) : colorExpr(p.stroke ?? { r: 0, g: 0, b: 0, a: 1 }, view.ctx, view.id);
    const rotate = p.ring.startAngle ? `.rotationEffect(.degrees(${Number.isInteger(p.ring.startAngle) ? p.ring.startAngle : num3(p.ring.startAngle)}))` : "";
    return [`Circle().trim(from: 0, to: ${num3(p.ring.to)}).stroke(${withOpacity(paint, p.strokeOpacity)}, style: StrokeStyle(lineWidth: ${num3(lw)}, lineCap: .${p.lineCap ?? "butt"}))${rotate}.padding(${num3(inset)})`];
  }
  const name = shapeName(p.d, vb, view.shapes);
  const suffix = layerSuffix(p, view);
  const out = [];
  const fill = p.gradient ? gradientExpr(p.gradient, vb, view) : p.fill && p.fill.a > 0 ? colorExpr(p.fill, view.ctx, view.id) : undefined;
  if (fill)
    out.push(`${name}().fill(${withOpacity(fill, p.fillOpacity)}${p.eoFill ? ", style: FillStyle(eoFill: true)" : ""})${suffix}`);
  const stroke = p.strokeGradient ? gradientExpr(p.strokeGradient, vb, view) : p.stroke && p.stroke.a > 0 ? colorExpr(p.stroke, view.ctx, view.id) : undefined;
  if (stroke) {
    const lw = (p.strokeWidth ?? 1) * scale;
    let style = `lineWidth: ${num3(lw)}, lineCap: .${p.lineCap ?? "butt"}, lineJoin: .${p.lineJoin ?? "miter"}`;
    if (p.miterLimit !== undefined)
      style += `, miterLimit: ${num3(p.miterLimit)}`;
    if (p.dash?.length)
      style += `, dash: [${p.dash.map((v) => num3(v * scale)).join(", ")}]${p.dashPhase ? `, dashPhase: ${num3(p.dashPhase * scale)}` : ""}`;
    out.push(`${name}().stroke(${withOpacity(stroke, p.strokeOpacity)}, style: StrokeStyle(${style}))${suffix}`);
  }
  return out;
}
function layerSuffix(p, view) {
  let s = p.opacity !== undefined ? `.opacity(${num3(p.opacity)})` : "";
  if (p.clip)
    s += `.clipShape(${shapeName(p.clip.d, view.vb, view.shapes)}()${p.clip.eoFill ? ", style: FillStyle(eoFill: true)" : ""})`;
  if (p.mask?.length) {
    const layers = p.mask.flatMap((m) => layerLines(m, view));
    const content = layers.length === 1 ? layers[0] : `ZStack { ${layers.join("; ")} }`;
    s += `.mask { ${content}.luminanceToAlpha() }`;
  }
  return s;
}
function withOpacity(paint, opacity) {
  return opacity === undefined ? paint : `${paint}.opacity(${num3(opacity)})`;
}
function gradientExpr(g, box, view) {
  const { scale } = view;
  const [bx, by, bw, bh] = box;
  const unit = ([x, y]) => `UnitPoint(x: ${num3(bw ? (x - bx) / bw : 0.5)}, y: ${num3(bh ? (y - by) / bh : 0.5)})`;
  const stops = "[" + g.stops.map((s) => `.init(color: ${colorExpr(s.color, view.ctx, view.id)}, location: ${num3(s.pos)})`).join(", ") + "]";
  if (g.kind === "linear")
    return `LinearGradient(stops: ${stops}, startPoint: ${unit(g.start)}, endPoint: ${unit(g.end)})`;
  const [rx, ry] = g.radius;
  if (bw && bh && Math.abs(rx / bw - ry / bh) < 0.005 && Math.abs(rx - ry) > 0.01) {
    return `EllipticalGradient(stops: ${stops}, center: ${unit(g.center)}, startRadiusFraction: 0, endRadiusFraction: ${num3(rx / bw)})`;
  }
  return `RadialGradient(stops: ${stops}, center: ${unit(g.center)}, startRadius: 0, endRadius: ${num3((rx + ry) / 2 * scale)})`;
}
function textLine(t, view) {
  const font = { ...t.font, size: t.font.size * view.scale };
  const cx = t.box.x + t.box.w / 2 - view.offset[0], cy = t.box.y + t.box.h / 2 - view.offset[1];
  return `Text(verbatim: ${str(t.text)}).font(${fontExpr(font, view.ctx)}).foregroundStyle(${colorExpr(t.fill, view.ctx, view.id)}).fixedSize().position(x: ${num3(cx)}, y: ${num3(cy)})`;
}
function shapeName(d, vb, shapes) {
  const key = `${vb.join(" ")}|${d}`;
  const name = "MarkswiftShape_" + hash(key);
  if (shapes[name])
    return name;
  const norm = import_svgpath3.default(d).unshort().unarc().abs();
  const [vx, vy, vw, vh] = vb;
  const w = new Writer;
  w.block(`nonisolated struct ${name}: Shape {`, () => {
    w.block("func path(in rect: CGRect) -> Path {", () => {
      w.line(`let sx = rect.width / ${num3(vw)}, sy = rect.height / ${num3(vh)}`);
      w.line(`func P(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: rect.minX + (x - ${num3(vx)}) * sx, y: rect.minY + (y - ${num3(vy)}) * sy) }`);
      w.line("var p = Path()");
      norm.iterate((seg) => {
        const [cmd, ...a] = seg;
        switch (cmd) {
          case "M":
            w.line(`p.move(to: P(${num3(a[0])}, ${num3(a[1])}))`);
            break;
          case "L":
            w.line(`p.addLine(to: P(${num3(a[0])}, ${num3(a[1])}))`);
            break;
          case "H":
            w.line(`p.addLine(to: CGPoint(x: P(${num3(a[0])}, 0).x, y: p.currentPoint?.y ?? 0))`);
            break;
          case "V":
            w.line(`p.addLine(to: CGPoint(x: p.currentPoint?.x ?? 0, y: P(0, ${num3(a[0])}).y))`);
            break;
          case "C":
            w.line(`p.addCurve(to: P(${num3(a[4])}, ${num3(a[5])}), control1: P(${num3(a[0])}, ${num3(a[1])}), control2: P(${num3(a[2])}, ${num3(a[3])}))`);
            break;
          case "Q":
            w.line(`p.addQuadCurve(to: P(${num3(a[2])}, ${num3(a[3])}), control: P(${num3(a[0])}, ${num3(a[1])}))`);
            break;
          case "Z":
            w.line("p.closeSubpath()");
            break;
        }
      });
      w.line("return p");
    });
  });
  shapes[name] = w.toString();
  return name;
}

// src/swift/diagnostics.ts
function note(n, text) {
  if (!n.notes.includes(text))
    n.notes.push(text);
  if (n.confidence === "mapped")
    n.confidence = "approximated";
}

// src/swift/images.ts
function imageLayer(p, n, prop, ctx) {
  const src = imageSource(p.url, n, prop, ctx, p.size !== undefined);
  if (!src)
    return;
  const box = n.frame;
  const repeat = p.repeat !== undefined && p.repeat !== "no-repeat";
  const tile = repeat ? typeof p.size === "object" ? [p.size.w, p.size.h] : src.kind === "vector" ? src.size : undefined : undefined;
  let view;
  if (src.kind === "vector") {
    const [vw, vh] = src.size;
    const s = p.size === "cover" ? Math.max(box.w / vw, box.h / vh) : p.size === "contain" ? Math.min(box.w / vw, box.h / vh) : 1;
    view = src.view(typeof p.size === "object" ? p.size.w : vw * s, typeof p.size === "object" ? p.size.h : vh * s);
  } else if (tile)
    view = [src.expr(".resizable()")];
  else if (repeat) {
    view = [src.expr(".resizable(resizingMode: .tile)")];
    if (p.repeat !== "repeat")
      note(n, `approximated: background-repeat ${p.repeat} tiles both axes`);
    if (p.position && (p.position[0] !== 0 || p.position[1] !== 0))
      note(n, `approximated: background-position ignored on a repeating ${prop}`);
  } else {
    const sizing = p.size === "cover" ? ".resizable().scaledToFill()" : p.size === "contain" ? ".resizable().scaledToFit()" : p.size ? `.resizable().frame(width: ${num3(p.size.w)}, height: ${num3(p.size.h)})` : "";
    view = [src.expr(sizing)];
  }
  if (tile) {
    const [x, y] = p.position ?? [0, 0];
    const args = [`tile: CGSize(width: ${num3(tile[0])}, height: ${num3(tile[1])})`, x || y ? `origin: CGPoint(x: ${num3(x)}, y: ${num3(y)})` : "", p.repeat === "repeat-x" ? "axes: .horizontal" : p.repeat === "repeat-y" ? "axes: .vertical" : ""];
    return ["Color.clear", `.overlay { MarkswiftTile(${args.filter(Boolean).join(", ")}) {`, ...indent(view, 1), "} }"];
  }
  if (repeat || !p.position)
    return ["Color.clear", ".overlay {", ...indent(view, 1), "}"];
  const [x, y] = p.position;
  return ["Color.clear", ".overlay(alignment: .topLeading) {", ...indent(x || y ? [...view, `.offset(x: ${num3(x)}, y: ${num3(y)})`] : view, 1), "}"];
}
function imageSource(url, n, prop, ctx, sizedBackground = false) {
  const data = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(url);
  if (!data) {
    if (/^https?:/i.test(url))
      return { kind: "raster", expr: (sizing) => `AsyncImage(url: URL(string: ${str(url)})) { $0${sizing} } placeholder: { Color.clear }` };
    const name = url.replace(/[?#].*$/, "").replace(/^.*\//, "").replace(/\.[a-z0-9]+$/i, "");
    return { kind: "raster", expr: (sizing) => `Image(${str(name)})${sizing}` };
  }
  const [, mime = "", params = "", payload = ""] = data;
  const base64 = params.split(";").includes("base64");
  if (mime !== "image/svg+xml") {
    const b64 = base64 ? payload : Buffer.from(payload.replace(/%([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), "latin1").toString("base64");
    return { kind: "raster", expr: (sizing) => `Image.markswiftData(${str(b64)})${sizing}` };
  }
  const markup = base64 ? Buffer.from(payload, "base64").toString("utf8") : decodeURIComponent(payload);
  const svg = svgFromMarkup(markup, { x: 0, y: 0, w: 0, h: 0 });
  if (!svg) {
    note(n, `unmapped: ${prop} svg data: URL has no usable viewBox or intrinsic size; layer dropped`);
    return;
  }
  for (const t of svg.notes)
    note(n, t);
  if (svg.invalidIntrinsic) {
    if (prop !== "img" && !sizedBackground) {
      note(n, `unmapped: ${prop} ${svg.invalidIntrinsic}; automatic-size layer dropped`);
      return;
    }
    note(n, `approximated: ${prop} ${svg.invalidIntrinsic}; sizing uses viewBox ratio`);
  }
  return {
    kind: "vector",
    size: svg.intrinsicSize ?? [svg.viewBox[2], svg.viewBox[3]],
    view: (w, h) => {
      svg.frame = { x: 0, y: 0, w, h };
      return [...svgExpr(svg, ctx.shapes, ctx), `.frame(width: ${num3(w)}, height: ${num3(h)})`];
    }
  };
}
var RASTER_MAGIC = [
  [137, 80, 78, 71],
  [255, 216, 255],
  [71, 73, 70, 56],
  [66, 77],
  [82, 73, 70, 70],
  [73, 73, 42, 0],
  [77, 77, 0, 42]
];
function decodable(url) {
  const data = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(url);
  if (!data)
    return url.length > 0;
  const [, mime = "", params = "", payload = ""] = data;
  if (mime === "image/svg+xml")
    return true;
  const bytes = params.split(";").includes("base64") ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "latin1");
  return RASTER_MAGIC.some((magic) => magic.every((b, i) => bytes[i] === b));
}
function imageNodeExpr(n, ctx) {
  const a11y = n.alt === undefined ? [] : n.alt === "" ? [".accessibilityHidden(true)"] : [`.accessibilityLabel(${str(n.alt)})`];
  const src = decodable(n.src) ? imageSource(n.src, n, "img", ctx) : undefined;
  if (!src) {
    if (!n.alt)
      return ["Color.clear", ...a11y];
    note(n, "approximated: broken image source → alt text in the measured box");
    return [
      `Text(verbatim: ${str(n.alt)})`,
      ...n.font ? [`.font(${fontExpr(n.font, ctx)})`] : [],
      ...n.color ? [`.foregroundStyle(${colorExpr(n.color, ctx, n.id)})`] : [],
      ".frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)",
      ...a11y
    ];
  }
  if (src.kind === "raster") {
    if (n.objectPosition && n.intrinsicSize && (n.contentMode === "fill" || n.contentMode === "fit")) {
      const [iw, ih] = n.intrinsicSize;
      const [x, y] = n.objectPosition;
      return [
        "Color.clear",
        ".overlay {",
        "    GeometryReader { geometry in",
        `        let scale = ${n.contentMode === "fill" ? "max" : "min"}(geometry.size.width / ${num3(iw)}, geometry.size.height / ${num3(ih)})`,
        `        let drawnWidth = ${num3(iw)} * scale`,
        `        let drawnHeight = ${num3(ih)} * scale`,
        `        ${src.expr(".resizable()")}`,
        "            .frame(width: drawnWidth, height: drawnHeight)",
        `            .offset(x: (geometry.size.width - drawnWidth) * ${num3(x)}, y: (geometry.size.height - drawnHeight) * ${num3(y)})`,
        "    }",
        "}",
        ...a11y
      ];
    }
    const sizing = n.contentMode === "stretch" ? ".resizable()" : n.contentMode === "none" ? "" : `.resizable().aspectRatio(contentMode: .${n.contentMode})`;
    return [src.expr(sizing), ...a11y];
  }
  const [vw, vh] = src.size;
  if (n.contentMode === "stretch") {
    return [...src.view(n.frame.w, n.frame.h), ...a11y];
  }
  const liveBox = ctx.mode === "app" && (n.width.kind === "fill" || n.width.kind === "fraction" || n.height.kind === "fill");
  if (liveBox && n.contentMode !== "none") {
    const scale = n.contentMode === "fill" ? "max" : "min";
    const [x, y] = n.objectPosition ?? [0.5, 0.5];
    return [
      "Color.clear",
      ".overlay {",
      "    GeometryReader { geometry in",
      ...n.objectPosition ? [`        let scale = ${scale}(geometry.size.width / ${num3(vw)}, geometry.size.height / ${num3(vh)})`] : [],
      ...indent(src.view(vw, vh), 2),
      `        .scaleEffect(${n.objectPosition ? "scale" : `${scale}(geometry.size.width / ${num3(vw)}, geometry.size.height / ${num3(vh)})`})`,
      ...n.objectPosition ? [
        `        .offset(x: (geometry.size.width - ${num3(vw)} * scale) * ${num3(x - 0.5)}, y: (geometry.size.height - ${num3(vh)} * scale) * ${num3(y - 0.5)})`
      ] : [],
      "        .frame(width: geometry.size.width, height: geometry.size.height)",
      "    }",
      "}",
      ...a11y
    ];
  }
  const s = n.contentMode === "none" ? 1 : n.contentMode === "fill" ? Math.max(n.frame.w / vw, n.frame.h / vh) : Math.min(n.frame.w / vw, n.frame.h / vh);
  const drawn = src.view(vw * s, vh * s);
  const [x, y] = n.objectPosition ?? [0.5, 0.5];
  const offsetX = (n.frame.w - vw * s) * (x - 0.5);
  const offsetY = (n.frame.h - vh * s) * (y - 0.5);
  return ["Color.clear", ".overlay(alignment: .center) {", ...indent(n.objectPosition ? [...drawn, `.offset(x: ${num3(offsetX)}, y: ${num3(offsetY)})`] : drawn, 1), "}", ...a11y];
}

// src/swift/paint.ts
function shapeExpr(st, w, h) {
  if (st.ellipse)
    return "Ellipse()";
  const r = st.radius;
  if (!r || r.every((v) => v === 0))
    return "Rectangle()";
  const allSame = r.every((v) => Math.abs(v - r[0]) < 0.01);
  if (allSame) {
    if (r[0] >= Math.min(w, h) / 2 - 0.01)
      return Math.abs(w - h) < 0.01 ? "Circle()" : "Capsule(style: .circular)";
    return `RoundedRectangle(cornerRadius: ${num3(r[0])}, style: .circular)`;
  }
  return `UnevenRoundedRectangle(topLeadingRadius: ${num3(r[0])}, bottomLeadingRadius: ${num3(r[3])}, bottomTrailingRadius: ${num3(r[2])}, topTrailingRadius: ${num3(r[1])}, style: .circular)`;
}
function paintExpr(p, w, h, ctx, id) {
  switch (p.kind) {
    case "solid":
      return colorExpr(p.color, ctx, id);
    case "linear": {
      const rad = p.angle * Math.PI / 180;
      const sx = 0.5 - 0.5 * Math.sin(rad), sy = 0.5 + 0.5 * Math.cos(rad);
      const ex = 0.5 + 0.5 * Math.sin(rad), ey = 0.5 - 0.5 * Math.cos(rad);
      return `LinearGradient(stops: ${stops(p, ctx, id)}, startPoint: UnitPoint(x: ${num3(sx)}, y: ${num3(sy)}), endPoint: UnitPoint(x: ${num3(ex)}, y: ${num3(ey)}))`;
    }
    case "radial": {
      const [cx, cy] = p.center;
      const fx = Math.max(cx, 1 - cx) * w, fy = Math.max(cy, 1 - cy) * h;
      const R = p.ellipse ? Math.hypot(fx, fy) : Math.hypot(fx, fy);
      return `RadialGradient(stops: ${stops(p, ctx, id)}, center: UnitPoint(x: ${num3(cx)}, y: ${num3(cy)}), startRadius: 0, endRadius: ${num3(R)})`;
    }
    case "conic":
      return `AngularGradient(stops: ${stops(p, ctx, id)}, center: UnitPoint(x: ${num3(p.center[0])}, y: ${num3(p.center[1])}), startAngle: .degrees(${num3(p.from - 90)}), endAngle: .degrees(${num3(p.from + 270)}))`;
    default:
      return "Color.clear";
  }
}
function stops(p, ctx, id) {
  let s = p.stops;
  const period = s[s.length - 1]?.pos ?? 0;
  if (p.repeating && period > 0 && period < 1) {
    const tiled = [];
    for (let k = 0;k * period < 1 - 0.000001 && tiled.length < 400; k++)
      for (const x of s)
        tiled.push({ color: x.color, pos: Math.min(1, (x.pos ?? 0) + k * period) });
    s = tiled;
  }
  return "[" + s.map((x) => `.init(color: ${colorExpr(x.color, ctx, id)}, location: ${num3(x.pos ?? 0)})`).join(", ") + "]";
}
function fillModifier(p, n, shape, ctx) {
  const inset = p.kind !== "unsupported" && p.inset?.some((v) => v !== 0) ? `.padding(EdgeInsets(top: ${num3(p.inset[0])}, leading: ${num3(p.inset[3])}, bottom: ${num3(p.inset[2])}, trailing: ${num3(p.inset[1])}))` : "";
  if (p.kind !== "image") {
    const paint = paintExpr(p, n.frame.w, n.frame.h, ctx, n.id);
    return inset ? [`.background { ${shape}.fill(${paint})${inset} }`] : [`.background(${paint}, in: ${shape})`];
  }
  const layer = imageLayer(p, n, "background-image", ctx);
  return layer ? [".background {", ...indent([...layer, `.clipShape(${shape})${inset}`], 1), "}"] : [];
}
var SWIFT_BLEND = {
  normal: undefined,
  multiply: ".multiply",
  screen: ".screen",
  overlay: ".overlay",
  darken: ".darken",
  lighten: ".lighten",
  "color-dodge": ".colorDodge",
  "color-burn": ".colorBurn",
  "hard-light": ".hardLight",
  "soft-light": ".softLight",
  difference: ".difference",
  exclusion: ".exclusion",
  hue: ".hue",
  saturation: ".saturation",
  color: ".color",
  luminosity: ".luminosity",
  "plus-lighter": ".plusLighter",
  "plus-darker": ".plusDarker"
};
function swiftBlend(css) {
  const mode = parseBlendMode(css);
  return mode ? SWIFT_BLEND[mode] : undefined;
}
function blendedFillModifier(fills, n, shape, ctx) {
  const layers = [];
  for (const p of fills) {
    const inner = fillLayerView(p, n, shape, ctx);
    if (!inner.length)
      continue;
    const blend = p.kind !== "unsupported" && p.blend ? swiftBlend(p.blend) : undefined;
    layers.push(...blend ? [...inner, `.blendMode(${blend})`] : inner);
  }
  if (!layers.length)
    return [];
  return [".background {", ...indent(["ZStack(alignment: .topLeading) {", ...indent(layers, 1), "}", ".compositingGroup()"], 1), "}"];
}
function fillLayerView(p, n, shape, ctx) {
  const inset = p.kind !== "unsupported" && p.inset?.some((v) => v !== 0) ? `.padding(EdgeInsets(top: ${num3(p.inset[0])}, leading: ${num3(p.inset[3])}, bottom: ${num3(p.inset[2])}, trailing: ${num3(p.inset[1])}))` : "";
  if (p.kind === "unsupported")
    return [];
  if (p.kind !== "image")
    return [`${shape}.fill(${paintExpr(p, n.frame.w, n.frame.h, ctx, n.id)})${inset}`];
  const layer = imageLayer(p, n, "background-image", ctx);
  return layer ? [...layer, `.clipShape(${shape})${inset}`] : [];
}

// src/swift/text-box.ts
function clipsFirstLine(n) {
  const font = n.runs.find((run) => run.gap === undefined)?.font;
  const lineHeight = font?.lineHeight ?? (font ? font.size * 1.193359 : 0);
  return n.maxHeight !== undefined && n.frame.h - n.padding[0] - n.padding[2] < lineHeight - 0.5;
}
function textBoxAlignment(n, top = false) {
  if (!top)
    return n.align === "center" ? ".center" : n.align === "trailing" ? ".trailing" : ".leading";
  return n.align === "center" ? ".top" : n.align === "trailing" ? ".topTrailing" : ".topLeading";
}

// src/swift/text.ts
var SYSTEM_LINE_HEIGHT = 1.193359;
function naturalLineHeight(f, metrics) {
  if (f.family.kind !== "custom")
    return f.size * SYSTEM_LINE_HEIGHT;
  const m = metrics[f.family.name.toLowerCase()];
  const ratio = m ? (m.ascent + m.descent + m.lineGap) / m.upem : SYSTEM_LINE_HEIGHT;
  return f.size * ratio;
}
function textExpr(n, ctx) {
  const runs = n.runs;
  if (ctx.mode === "fidelity" && runs.some((r) => r.breaks?.length))
    note(n, "approximated: line division forced from the browser (native wraps differently)");
  if (ctx.mode === "app" && usesGreedyWords(n)) {
    const run = runs[0];
    const natural = naturalLineHeight(run.font, ctx.fontMetrics);
    const leading = run.font.lineHeight - natural;
    const out = [`MarkswiftGreedyText(${str(run.text)}, font: ${fontExpr(run.font, ctx)}, color: ${colorExpr(run.color, ctx, n.id)}, fontSize: ${num3(run.font.size)}, lineGap: ${num3(leading)})`];
    if (Math.abs(leading) >= 0.5 && n.frame.h - n.padding[0] - n.padding[2] >= n.lines * run.font.lineHeight - 0.5) {
      out.push(`.padding(.vertical, ${num3(leading / 2)})`);
    }
    return out;
  }
  const glyphs = runs.filter((r) => r.gap === undefined);
  const shared = glyphs.every((r) => r.transform === glyphs[0]?.transform) ? glyphs[0]?.transform : undefined;
  const viewCase = shared === "uppercase" || shared === "lowercase" ? shared : undefined;
  const parts = runs.map((r) => runExpr(r, n, viewCase === undefined, ctx));
  if (n.layoutDirection === "rtl")
    parts.unshift("Text.markswiftRTL");
  const out = parts.length === 1 ? [parts[0]] : [`Text.markswiftRuns([
    ${parts.join(`,
    `)},
])`];
  if (n.align !== "leading")
    out.push(`.multilineTextAlignment(.${n.align})`);
  if (n.lineLimit !== undefined)
    out.push(`.lineLimit(${n.lineLimit})`);
  if (n.truncate)
    out.push(".truncationMode(.tail)");
  const first = glyphs[0];
  const natural = first ? naturalLineHeight(first.font, ctx.fontMetrics) : 0;
  const leading = first?.font.lineHeight === undefined ? 0 : first.font.lineHeight - natural;
  if (leading >= 0.01 && (ctx.mode === "app" || n.lines > 1))
    out.push(`.lineSpacing(${num3(leading)})`);
  if (leading <= -0.01 && n.lines > 1)
    note(n, `approximated: line-height ${num3(natural + leading)} is tighter than the face's natural ${num3(natural)} → lines cannot be compressed`);
  if (viewCase)
    out.push(`.textCase(.${viewCase})`);
  const shadow = glyphs.find((r) => r.shadow)?.shadow;
  if (shadow) {
    if (shadow.color.a > 0)
      out.push(`.shadow(color: ${colorExpr(shadow.color, ctx, n.id)}, radius: ${num3(shadow.blur / 2)}, x: ${num3(shadow.x)}, y: ${num3(shadow.y)})`);
    if (!glyphs.every((r) => r.shadow === undefined || JSON.stringify(r.shadow) === JSON.stringify(shadow)))
      note(n, "approximated: text-shadow of the first shadowed run applied to the whole text");
  }
  const clamped = n.lineLimit !== undefined && n.noWrap !== true;
  const divided = n.noWrap === true || ctx.mode === "fidelity" && runs.some((r) => r.breaks?.length);
  const noSoftWrap = !n.truncate && !clamped && (divided || ctx.mode === "fidelity" && n.lines === 1);
  out.push(`.fixedSize(horizontal: ${noSoftWrap}, vertical: true)`);
  if (ctx.mode === "fidelity") {
    const written = 1 + runs.reduce((k, r) => k + (r.text.match(/\n/g)?.length ?? 0) + (r.breaks?.length ?? 0), 0);
    const shown = n.lineLimit === undefined ? written : Math.min(written, n.lineLimit);
    const align = textBoxAlignment(n, shown > n.lines || clipsFirstLine(n));
    const size = [noSoftWrap && divided ? `width: ${num3(n.frame.w - n.padding[1] - n.padding[3])}` : "", `height: ${num3(n.frame.h - n.padding[0] - n.padding[2])}`].filter(Boolean);
    out.push(`.frame(${size.join(", ")}, alignment: ${align})`);
  } else if (Math.abs(leading) >= 0.5 && n.frame.h - n.padding[0] - n.padding[2] >= n.lines * (natural + leading) - 0.5) {
    out.push(`.padding(.vertical, ${num3(leading / 2)})`);
  }
  return out;
}
function usesGreedyWords(n) {
  const heading = /^h[1-6]$/.test(n.sourceTag ?? "");
  if (n.sourceTag !== "p" && !heading || n.runs.length !== 1 || n.align !== "leading" || n.layoutDirection === "rtl" || n.noWrap || n.lineLimit || n.truncate)
    return false;
  if (n.overlays.length || n.style.clip || n.maxHeight !== undefined || n.style.hidden)
    return false;
  const r = n.runs[0];
  if (r.href || r.gap !== undefined || r.bound || r.italic || r.decoration || r.shadow || r.paint || r.kerning || r.transform || r.tabularNums || r.baselineOffset !== undefined)
    return false;
  if (r.font.family.kind !== "system" || r.font.family.design !== "default" || !heading && r.font.weight !== 400 || r.font.lineHeight === undefined)
    return false;
  if (!heading && r.font.lineHeight < naturalLineHeight(r.font, {}))
    return false;
  if (n.notes.some((note) => note.includes("font-family")))
    return false;
  return /^[\x21-\x7E]+(?: [\x21-\x7E]+)+$/.test(r.text);
}
function runExpr(r, n, literalTransform, ctx) {
  if (r.gap !== undefined)
    return `Text.markswiftGap(${num3(r.gap)})`;
  let text = r.text;
  if (ctx.mode === "fidelity" && r.breaks?.length) {
    let at = 0;
    let broken = "";
    for (const b of r.breaks) {
      broken += text.slice(at, text[b - 1] === " " ? b - 1 : b) + `
`;
      at = b;
    }
    text = broken + text.slice(at);
  }
  if (literalTransform && r.transform) {
    text = transformLiteral(text, r.transform);
    if (r.transform === "capitalize")
      note(n, "approximated: text-transform capitalize applied to the literal (no .textCase equivalent)");
    if (r.bound)
      note(n, "approximated: text-transform baked into a bound run's literal");
  }
  let e = r.href ? `Text.markswiftLink(${str(text)}, ${str(r.href)})` : `Text(verbatim: ${str(text)})`;
  e += `.font(${fontExpr(r.font, ctx)})`;
  if (r.italic)
    e += ".italic()";
  const paint = r.paint && r.paint.kind !== "image" && r.paint.kind !== "unsupported" ? paintExpr(r.paint, n.frame.w, n.frame.h, ctx, n.id) : undefined;
  if (r.paint && !paint)
    note(n, `approximated: background-clip text with a ${r.paint.kind} paint falls back to the text color`);
  e += `.foregroundStyle(${paint ?? colorExpr(r.color, ctx, n.id)})`;
  if (r.decoration) {
    const d = r.decoration;
    const pattern = d.style === "dotted" ? ".dot" : d.style === "dashed" ? ".dash" : undefined;
    if (d.style === "wavy" || d.style === "double")
      note(n, `approximated: text-decoration-style ${d.style} drawn solid`);
    const args = [pattern ? `pattern: ${pattern}` : "", d.color ? `color: ${colorExpr(d.color, ctx, n.id)}` : ""].filter(Boolean).join(", ");
    for (const line of d.lines) {
      if (line === "underline")
        e += `.underline(${args})`;
      else if (line === "line-through")
        e += `.strikethrough(${args})`;
      else
        note(n, "approximated: text-decoration-line overline has no SwiftUI form; dropped");
    }
  }
  if (r.kerning !== undefined && r.kerning !== 0)
    e += `.kerning(${num3(r.kerning)})`;
  if (r.tabularNums)
    e += ".monospacedDigit()";
  if (r.baselineOffset !== undefined)
    e += `.baselineOffset(${num3(r.baselineOffset)})`;
  return e;
}
function transformLiteral(text, t) {
  if (t === "uppercase")
    return text.toUpperCase();
  if (t === "lowercase")
    return text.toLowerCase();
  return text.replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (_, before, letter) => before + letter.toUpperCase());
}
// src/swift/control-runtime.ts
var CONTROL_RUNTIME = `
// \`UTType\` (the file importer's content types) is not re-exported by SwiftUI or Foundation.
import UniformTypeIdentifiers

/// A URL from a design's \`href\`. Anything the design left unresolvable (an in-page anchor, a
/// relative path, a malformed URL) becomes \`about:blank\` rather than trapping at runtime.
nonisolated func markswiftURL(_ s: String) -> URL {
    URL(string: s) ?? URL(string: "about:blank")!
}

/// The types an \`<input type="file" accept>\` list names. The tokens are the attribute's own
/// forms — \`.png\`, \`image/png\`, \`image/*\` — and only the running system knows what they mean,
/// so they are resolved here rather than at generation time. A token the system does not
/// recognise is dropped, and a list that resolves to nothing means "any file".
nonisolated func markswiftContentTypes(_ accept: String) -> [UTType] {
    var out: [UTType] = []
    for token in accept.split(separator: ",") {
        let name = String(token.filter { !$0.isWhitespace }).lowercased()
        if name.isEmpty { continue }
        let type: UTType?
        if name.hasPrefix(".") {
            type = UTType(filenameExtension: String(name.dropFirst()))
        } else if name.hasSuffix("/*") {
            switch String(name.dropLast(2)) {
            case "image": type = .image
            case "audio": type = .audio
            case "video": type = .movie
            case "text": type = .text
            default: type = .item
            }
        } else {
            type = UTType(mimeType: name)
        }
        if let type, !out.contains(type) { out.append(type) }
    }
    return out.isEmpty ? [.item] : out
}

/// The checkbox and radio HTML draws: a small square or circle that fills with the tint when on.
/// iOS has no native checkbox, and a switch does not fit the box the design measured.
@MainActor struct MarkswiftMarkToggleStyle: ToggleStyle {
    enum Mark { case check, dot }
    let mark: Mark
    let tint: Color

    func makeBody(configuration: Configuration) -> some View {
        Button {
            configuration.isOn.toggle()
        } label: {
            ZStack {
                box(on: configuration.isOn)
                if configuration.isOn { fill }
            }
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private func box(on: Bool) -> some View {
        let face = on ? tint : Color(uiColor: .systemBackground)
        let line = on ? tint : Color(uiColor: .systemGray2)
        switch mark {
        case .check:
            RoundedRectangle(cornerRadius: 2, style: .circular)
                .fill(face)
                .overlay(RoundedRectangle(cornerRadius: 2, style: .circular).strokeBorder(line, lineWidth: 1))
        case .dot:
            Circle()
                .fill(on ? Color.clear : face)
                .overlay(Circle().strokeBorder(line, lineWidth: on ? 2 : 1))
        }
    }

    @ViewBuilder private var fill: some View {
        switch mark {
        case .check:
            Image(systemName: "checkmark")
                .resizable()
                .scaledToFit()
                .fontWeight(.bold)
                .foregroundStyle(Color(uiColor: .systemBackground))
                .padding(2)
        case .dot:
            Circle().fill(tint).padding(3)
        }
    }
}

/// The bar a browser paints for \`<progress>\`/\`<meter>\`: a rounded track with the completed part
/// filled, centred in the element's box.
nonisolated struct MarkswiftBar: View {
    let fraction: Double
    let height: CGFloat
    let tint: Color
    let track: Color
    let edge: Color

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(track)
                Capsule().fill(tint).frame(width: geo.size.width * min(max(fraction, 0), 1))
            }
            .overlay(Capsule().strokeBorder(edge, lineWidth: 1))
            .frame(height: height)
            .frame(maxHeight: .infinity, alignment: .center)
        }
    }
}

nonisolated struct MarkswiftBarProgressStyle: ProgressViewStyle {
    let height: CGFloat
    let tint: Color
    let track: Color
    let edge: Color

    func makeBody(configuration: Configuration) -> some View {
        // No value: the browser draws a short pulse near the start of the track.
        MarkswiftBar(fraction: configuration.fractionCompleted ?? 0.25, height: height, tint: tint, track: track, edge: edge)
    }
}

nonisolated struct MarkswiftBarGaugeStyle: GaugeStyle {
    let height: CGFloat
    let tint: Color
    let track: Color
    let edge: Color

    func makeBody(configuration: Configuration) -> some View {
        MarkswiftBar(fraction: configuration.value, height: height, tint: tint, track: track, edge: edge)
    }
}

/// A range input as the browser paints it: a half-height track filled up to the value, with a
/// round thumb on it. \`ImageRenderer\` cannot rasterise a live \`Slider\`, so the fidelity views
/// use this to verify the design's geometry.
nonisolated struct MarkswiftSliderTrack: View {
    let fraction: Double
    let height: CGFloat
    let tint: Color
    let track: Color
    let edge: Color

    var body: some View {
        GeometryReader { geo in
            let thumb = height * 0.875
            let usable = max(geo.size.width - thumb, 0)
            ZStack(alignment: .leading) {
                MarkswiftBar(fraction: fraction, height: height / 2, tint: tint, track: track, edge: edge)
                Circle()
                    .fill(tint)
                    .frame(width: thumb, height: thumb)
                    .offset(x: usable * min(max(fraction, 0), 1))
            }
            .frame(maxHeight: .infinity, alignment: .center)
        }
    }
}
`;

// src/swift/controls.ts
var UA = {
  light: { accent: "Color.markswift(0.0, 0.459, 1.0)", track: "Color.markswift(0.937, 0.937, 0.937)", edge: "Color.markswift(0.698, 0.698, 0.698)" },
  dark: { accent: "Color.markswift(0.6, 0.784, 1.0)", track: "Color.markswift(0.231, 0.231, 0.231)", edge: "Color.markswift(0.522, 0.522, 0.522)" }
};
function controlExpr(n, deps) {
  const out = core2(n, deps);
  if (n.font) {
    out.push(`.font(${fontExpr(n.font, deps)})`);
    const prompt = deps.mode === "fidelity" && !n.value && n.placeholder !== undefined;
    if (prompt)
      out.push(".foregroundStyle(Color(uiColor: .placeholderText))");
    else if (n.color)
      out.push(`.foregroundStyle(${colorExpr(n.color, deps, deps.id)})`);
  }
  if (n.disabled && deps.mode === "app")
    out.push(".disabled(true)");
  return out;
}
function core2(n, deps) {
  const state = deps.stateOf.get(n);
  const binding = state ? `$${state}` : "";
  const still = deps.mode === "fidelity";
  switch (n.control) {
    case "button": {
      const action = n.action !== undefined ? deps.actionOf.get(n.action) ?? "{}" : "{}";
      if (n.files && state) {
        return [
          "Button {",
          `    ${state} = true`,
          "} label: {",
          ...indent(body(n, deps), 1),
          "}",
          ".buttonStyle(.plain)",
          "// The design only says a file is chosen here; fill in what to do with it.",
          `.fileImporter(isPresented: ${binding}, allowedContentTypes: markswiftContentTypes(${str(n.files.accept.join(","))}), allowsMultipleSelection: ${n.files.multiple ? "true" : "false"}) { _ in }`
        ];
      }
      return wrap(`Button(action: ${action}) {`, body(n, deps), ["}", ".buttonStyle(.plain)"]);
    }
    case "link": {
      const href = n.href ?? "";
      if (n.action !== undefined) {
        const action = n.action !== undefined ? deps.actionOf.get(n.action) ?? "{}" : "{}";
        return wrap(`Button(action: ${action}) {`, body(n, deps), ["}", ".buttonStyle(.plain)"]);
      }
      return wrap(`Link(destination: markswiftURL(${str(href)})) {`, body(n, deps), ["}"]);
    }
    case "textField":
      if (still)
        return painted(n.value ?? n.placeholder ?? "", ".leading");
      return [`TextField(${str(n.placeholder ?? "")}, text: ${binding})`];
    case "secureField":
      if (still)
        return painted(n.value ? "•".repeat(n.value.length) : n.placeholder ?? "", ".leading");
      return [`SecureField(${str(n.placeholder ?? "")}, text: ${binding})`];
    case "textEditor":
      if (still)
        return painted(n.value ?? n.placeholder ?? "", ".topLeading");
      return [`TextEditor(text: ${binding})`, ".scrollContentBackground(.hidden)"];
    case "toggle":
    case "radio": {
      const ua = UA[deps.theme];
      const style = n.control === "radio" ? `MarkswiftMarkToggleStyle(mark: .dot, tint: ${ua.accent})` : n.frame.w >= n.frame.h * 1.4 && n.frame.w >= 28 ? ".switch" : `MarkswiftMarkToggleStyle(mark: .check, tint: ${ua.accent})`;
      return wrap(`Toggle(isOn: ${binding}) {`, body(n, deps), ["}", `.toggleStyle(${style})`]);
    }
    case "slider": {
      const r = n.range ?? { min: 0, max: 100 };
      if (still)
        return [`MarkswiftSliderTrack(fraction: ${num3(fraction2(n))}, height: ${num3(n.frame.h)}, tint: ${UA[deps.theme].accent}, track: ${UA[deps.theme].track}, edge: ${UA[deps.theme].edge})`];
      return [`Slider(value: ${binding}, in: ${num3(r.min)}...${num3(Math.max(r.max, r.min + 0.001))}${r.step ? `, step: ${num3(r.step)}` : ""})`];
    }
    case "stepper": {
      const r = n.range ?? { min: 0, max: 100 };
      if (still)
        return painted(n.value ?? "", ".leading");
      return [`Stepper(value: ${binding}, in: ${num3(r.min)}...${num3(Math.max(r.max, r.min + 0.001))}${r.step ? `, step: ${num3(r.step)}` : ""}) {`, "    EmptyView()", "}", ".labelsHidden()"];
    }
    case "picker": {
      if (still)
        return [
          "HStack(spacing: 4.0) {",
          ...indent(painted(n.value ?? "", ".leading"), 1),
          '    Image(systemName: "chevron.down")',
          "}"
        ];
      const options = n.options?.length ? n.options : n.value !== undefined ? [n.value] : [];
      return [
        `Picker(selection: ${binding}) {`,
        `    ForEach(${options.length ? `[${options.map(str).join(", ")}]` : "[String]()"}, id: \\.self) { option in`,
        "        Text(option)",
        "    }",
        "} label: {",
        ...indent(body(n, deps), 1),
        "}",
        ".pickerStyle(.menu)"
      ];
    }
    case "datePicker":
      if (still)
        return painted(n.value ?? "", ".leading");
      return [`DatePicker(selection: ${binding}, displayedComponents: .date) {`, ...indent(body(n, deps), 1), "}", ".labelsHidden()"];
    case "colorPicker": {
      const c = (n.value ? parseColor(n.value) : undefined) ?? { r: 0, g: 0, b: 0, a: 1 };
      if (still)
        return [`RoundedRectangle(cornerRadius: 4.0, style: .circular).fill(Color.markswift(${colorArgs(c)}))`];
      return [`ColorPicker(selection: ${binding}) {`, ...indent(body(n, deps), 1), "}", ".labelsHidden()"];
    }
    case "progress": {
      const ua = UA[deps.theme];
      const bar = `.progressViewStyle(MarkswiftBarProgressStyle(height: ${num3(barHeight(n))}, tint: ${ua.accent}, track: ${ua.track}, edge: ${ua.edge}))`;
      if (n.value === undefined)
        return ["SwiftUI.ProgressView()", bar];
      return [`SwiftUI.ProgressView(value: ${num3(fraction2(n))})`, bar];
    }
    case "gauge": {
      const r = n.range ?? { min: 0, max: 1 };
      const v = Number(n.value ?? r.min);
      return [
        `Gauge(value: ${num3(Number.isFinite(v) ? v : r.min)}, in: ${num3(r.min)}...${num3(Math.max(r.max, r.min + 0.001))}) {`,
        "    EmptyView()",
        "}",
        `.gaugeStyle(MarkswiftBarGaugeStyle(height: ${num3(barHeight(n))}, tint: ${LEVEL_TINT[n.level ?? "optimum"]}, track: ${UA[deps.theme].track}, edge: ${UA[deps.theme].edge}))`
      ];
    }
    case "disclosure":
      return [
        `DisclosureGroup(isExpanded: ${binding}) {`,
        ...indent(n.content.length ? stackOfNodes(n.content, deps) : ["EmptyView()"], 1),
        "} label: {",
        ...indent(n.label ? deps.child(n.label) : ["EmptyView()"], 1),
        "}"
      ];
  }
}
var LEVEL_TINT = {
  optimum: "Color.markswift(0.063, 0.486, 0.063)",
  suboptimal: "Color.markswift(1.0, 0.725, 0.0)",
  poor: "Color.markswift(0.847, 0.231, 0.004)"
};
function painted(text, alignment) {
  return [`Text(verbatim: ${str(text)})`, `.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: ${alignment})`];
}
function fraction2(n) {
  const r = n.range ?? { min: 0, max: 1 };
  const span = r.max - r.min;
  if (span <= 0)
    return 0;
  return Math.min(1, Math.max(0, (numericValue(n) - r.min) / span));
}
function barHeight(n) {
  return Math.round(n.frame.h * 50) / 100;
}
function body(n, deps) {
  const nodes = n.label ? [n.label, ...n.content] : n.content;
  if (n.control === "button" && !n.files && !nodes.length && n.value !== undefined) {
    const caption = painted(n.value, ".center");
    if (n.captionTransform === "uppercase" || n.captionTransform === "lowercase")
      caption.splice(1, 0, `.textCase(.${n.captionTransform})`);
    return caption;
  }
  return nodes.length ? stackOfNodes(nodes, deps) : ["EmptyView()"];
}
function wrap(open, inner, close) {
  return [open, ...indent(inner, 1), ...close];
}
function stackOfNodes(nodes, deps) {
  if (nodes.length === 1)
    return deps.child(nodes[0]);
  let horizontal = true;
  for (let i = 1;i < nodes.length; i++) {
    const a = nodes[i - 1].frame, b = nodes[i].frame;
    if (b.x < a.x + a.w - 0.5)
      horizontal = false;
  }
  const [a, b] = [nodes[0].frame, nodes[1].frame];
  const gap = Math.max(0, Math.round((horizontal ? b.x - (a.x + a.w) : b.y - (a.y + a.h)) * 100) / 100);
  const open = horizontal ? `HStack(alignment: .center, spacing: ${num3(gap)}) {` : `VStack(alignment: .leading, spacing: ${num3(gap)}) {`;
  return [open, ...indent(nodes.flatMap((c) => deps.child(c)), 1), "}"];
}

// src/swift/frames.ts
function frameModifier(n, ctx) {
  const parts = [];
  const app = ctx.mode === "app";
  const w = n.width.kind === "fixed" ? n.width.px : n.width.kind === "fraction" && !app ? n.width.capturedPx : undefined;
  const h = n.height.kind === "fixed" ? n.height.px : undefined;
  const screenWide = app && w !== undefined && Math.abs(w - ctx.screen.size.w) <= 0.5;
  const textFloor = app && h !== undefined && n.maxHeight === undefined && n.kind === "stack" && !n.measured && !n.wrap && n.children.length > 0 && n.children.every((c) => c.kind === "text") ? h : undefined;
  const fixedW = w !== undefined && !screenWide ? `width: ${num3(w)}` : undefined;
  const fixedH = h !== undefined && textFloor === undefined ? `height: ${num3(h)}` : undefined;
  const fillW = n.width.kind === "fill" || screenWide;
  const fillH = n.height.kind === "fill";
  const align = fillAlignment(n, ctx.mode);
  if (fixedW || fixedH)
    parts.push(`.frame(${[fixedW, fixedH].filter(Boolean).join(", ")}${n.kind === "text" || n.kind === "stack" || n.kind === "grid" ? `, alignment: ${align}` : ""})`);
  if (app && n.width.kind === "fraction")
    parts.push(`.modifier(MarkswiftRelativeWidth(fraction: ${num3(n.width.value)}, capturedWidth: ${num3(n.width.capturedPx)}))`);
  const minHeight = n.minHeight === undefined ? textFloor : Math.max(n.minHeight, textFloor ?? 0);
  const flex = [
    !fixedW && n.minWidth !== undefined ? `minWidth: ${num3(n.minWidth)}` : "",
    !fixedW && n.maxWidth !== undefined ? `maxWidth: ${num3(n.maxWidth)}` : !fixedW && fillW ? "maxWidth: .infinity" : "",
    !fixedH && minHeight !== undefined ? `minHeight: ${num3(minHeight)}` : "",
    !fixedH && n.maxHeight !== undefined ? `maxHeight: ${num3(n.maxHeight)}` : !fixedH && fillH ? "maxHeight: .infinity" : ""
  ].filter(Boolean);
  if (flex.length)
    parts.push(`.frame(${flex.join(", ")}, alignment: ${align})`);
  const hugW = !fixedW && n.width.kind === "hug" && n.maxWidth !== undefined;
  const hugH = !fixedH && n.height.kind === "hug" && n.maxHeight !== undefined;
  if (hugW || hugH)
    parts.push(`.fixedSize(horizontal: ${hugW}, vertical: ${hugH})`);
  return parts;
}
function fillAlignment(n, mode) {
  if (n.kind === "text")
    return textBoxAlignment(n, clipsFirstLine(n));
  if (n.kind === "stack") {
    if (n.wrap)
      return ".topLeading";
    const h = n.axis === "v" ? n.align : n.distribution;
    const v = n.axis === "v" ? n.distribution : mode === "app" ? n.align : "start";
    const hs = h === "center" ? "" : h === "end" ? "Trailing" : "Leading";
    const vs = v === "center" ? "center" : v === "end" ? "bottom" : "top";
    if (vs === "center")
      return hs === "" ? ".center" : hs === "Leading" ? ".leading" : ".trailing";
    return `.${vs}${hs}`;
  }
  return ".topLeading";
}

// src/swift/borders.ts
function borderSideModifiers(n, ctx) {
  const sides = n.style.borderSides;
  const r = n.style.radius ?? [0, 0, 0, 0];
  const edges = [
    [sides.top, ".top", "height"],
    [sides.right, ".trailing", "width"],
    [sides.bottom, ".bottom", "height"],
    [sides.left, ".leading", "width"]
  ];
  const drawn = edges.map(([e], i) => e && e.width > 0 && e.color.a > 0 ? i : -1).filter((i) => i >= 0);
  if (!drawn.length)
    return [];
  const curved = drawn.some((i) => r[i] > 0 || r[(i + 1) % 4] > 0);
  if (!curved)
    return straightBorderSides(edges, n, ctx);
  const widths = `[${edges.map(([e]) => num3(e?.width ?? 0)).join(", ")}]`;
  const radii = `[${r.map(num3).join(", ")}]`;
  const groups = [];
  for (const i of drawn) {
    const e = edges[i][0];
    const color = colorExpr(e.color, ctx, n.id);
    const key = `${color}|${e.style}|${e.width}`;
    const g = groups.find((x) => x.key === key);
    if (g)
      g.sides.push(i);
    else
      groups.push({ key, color, style: e.style, width: e.width, sides: [i] });
  }
  const m = [];
  for (const g of groups) {
    const head = `MarkswiftBorderSides(radii: ${radii}, widths: ${widths}, sides: [${g.sides.join(", ")}]`;
    const paint = (args) => m.push(`.overlay { ${head}${args}).fill(${g.color}) }`);
    switch (g.style) {
      case "double":
        paint(`, band: 0...${num3(1 / 3)}`);
        paint(`, band: ${num3(2 / 3)}...1`);
        break;
      case "dashed":
        paint(`, dash: [${num3(g.width * 3)}, ${num3(g.width * 2)}]`);
        break;
      case "dotted":
        paint(`, dash: [0.01, ${num3(g.width * 2)}], roundCaps: true`);
        break;
      default:
        paint("");
    }
  }
  return m;
}
function straightBorderSides(edges, n, ctx) {
  const m = [];
  for (const [e, edge, dim] of edges) {
    if (!e || e.width <= 0 || e.color.a <= 0)
      continue;
    const color = colorExpr(e.color, ctx, n.id);
    const overlay = (view) => `.overlay(alignment: ${edge}) { ${view} }`;
    const bar = (thickness, inset = 0) => `Rectangle().fill(${color}).frame(${dim}: ${num3(thickness)})${inset ? `.padding(${edge}, ${num3(inset)})` : ""}`;
    switch (e.style) {
      case "double": {
        const t = e.width / 3;
        m.push(overlay(bar(t)), overlay(bar(t, e.width - t)));
        break;
      }
      case "dashed":
        m.push(overlay(`MarkswiftEdgeLine(edge: ${edge}).stroke(${color}, style: StrokeStyle(lineWidth: ${num3(e.width)}, dash: [${num3(e.width * 3)}, ${num3(e.width * 2)}])).frame(${dim}: ${num3(e.width)})`));
        break;
      case "dotted":
        m.push(overlay(`MarkswiftEdgeLine(edge: ${edge}).stroke(${color}, style: StrokeStyle(lineWidth: ${num3(e.width)}, lineCap: .round, dash: [0.01, ${num3(e.width * 2)}])).frame(${dim}: ${num3(e.width)})`));
        break;
      default:
        m.push(overlay(bar(e.width)));
    }
  }
  return m;
}

// src/swift/effects.ts
function affineModifier(t, w, h) {
  const rad = Math.PI / 180;
  const cos = Math.cos(t.rotate * rad), sin = Math.sin(t.rotate * rad);
  const kx = Math.tan((t.skewX ?? 0) * rad), ky = Math.tan((t.skewY ?? 0) * rad);
  const mul = (p, q) => [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3]];
  const [a, b, c, d] = mul(mul(mul([cos, sin, -sin, cos], [1, 0, kx, 1]), [1, ky, 0, 1]), [t.scaleX, 0, 0, t.scaleY]);
  const ox = t.origin ? t.origin[0] : w / 2, oy = t.origin ? t.origin[1] : h / 2;
  const tx = t.tx + ox - (a * ox + c * oy), ty = t.ty + oy - (b * ox + d * oy);
  return `.transformEffect(CGAffineTransform(a: ${num3(a)}, b: ${num3(b)}, c: ${num3(c)}, d: ${num3(d)}, tx: ${num3(tx)}, ty: ${num3(ty)}))`;
}
function filterModifier(f, n, ctx) {
  switch (f.kind) {
    case "blur":
      return [`.blur(radius: ${num3(f.radius)})`];
    case "drop-shadow": {
      const s = f.shadow;
      return s.color.a > 0 ? [`.shadow(color: ${colorExpr(s.color, ctx, n.id)}, radius: ${num3(s.blur / 2)}, x: ${num3(s.x)}, y: ${num3(s.y)})`] : [];
    }
    case "grayscale":
      return [`.grayscale(${num3(f.amount)})`];
    case "brightness":
      return [`.brightness(${num3(f.amount - 1)})`];
    case "contrast":
      return [`.contrast(${num3(f.amount)})`];
    case "saturate":
      return [`.saturation(${num3(f.amount)})`];
    case "opacity":
      return [`.opacity(${num3(f.amount)})`];
    case "hue-rotate":
      return [`.hueRotation(.degrees(${num3(f.degrees)}))`];
    case "invert":
      if (f.amount !== 0 && f.amount !== 1)
        note(n, `approximated: filter invert(${num3(f.amount)}) is all-or-nothing on iOS`);
      return f.amount >= 0.5 ? [".colorInvert()"] : [];
    case "sepia": {
      const tint = [1, 0.89, 0.694].map((c) => 1 - f.amount * (1 - c));
      note(n, "approximated: filter sepia() as desaturation + warm tint");
      return [`.saturation(${num3(1 - f.amount)})`, `.colorMultiply(Color.markswift(${num3(tint[0])}, ${num3(tint[1])}, ${num3(tint[2])}))`];
    }
  }
}
function clipPathModifier(c, n, ctx) {
  const w = n.frame.w, h = n.frame.h;
  switch (c.kind) {
    case "circle": {
      const full = Math.abs(c.cx - w / 2) < 0.5 && Math.abs(c.cy - h / 2) < 0.5 && Math.abs(c.r - Math.min(w, h) / 2) < 0.5;
      return full ? ".clipShape(Circle())" : `.clipShape(Circle().size(width: ${num3(2 * c.r)}, height: ${num3(2 * c.r)}).offset(x: ${num3(c.cx - c.r)}, y: ${num3(c.cy - c.r)}))`;
    }
    case "ellipse":
      return `.clipShape(Ellipse().size(width: ${num3(2 * c.rx)}, height: ${num3(2 * c.ry)}).offset(x: ${num3(c.cx - c.rx)}, y: ${num3(c.cy - c.ry)}))`;
    case "inset": {
      const shape = c.radius ? `RoundedRectangle(cornerRadius: ${num3(c.radius)}, style: .circular)` : "Rectangle()";
      return `.mask { ${shape}.padding(EdgeInsets(top: ${num3(c.top)}, leading: ${num3(c.left)}, bottom: ${num3(c.bottom)}, trailing: ${num3(c.right)})) }`;
    }
    case "polygon":
      return `.clipShape(${polygonShape(c.points.map(([x, y]) => [w ? x / w : 0, h ? y / h : 0]), ctx.shapes)}())`;
  }
}
function polygonShape(points, shapes) {
  const pts = points.map(([x, y]) => [num3(x), num3(y)]);
  const name = "MarkswiftClip_" + hash(pts.map((p) => p.join(",")).join(" "));
  if (shapes[name])
    return name;
  const w = new Writer;
  w.block(`nonisolated struct ${name}: Shape {`, () => {
    w.block("func path(in rect: CGRect) -> Path {", () => {
      w.line("func P(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: rect.minX + rect.width * x, y: rect.minY + rect.height * y) }");
      w.line("var p = Path()");
      pts.forEach(([x, y], i) => w.line(`p.${i === 0 ? "move" : "addLine"}(to: P(${x}, ${y}))`));
      w.line("p.closeSubpath()");
      w.line("return p");
    });
  });
  shapes[name] = w.toString();
  return name;
}
function maskModifier(p, n, ctx) {
  if (p.kind === "image") {
    const layer = imageLayer(p, n, "mask-image", ctx);
    return layer ? [".mask {", ...indent(layer, 1), "}"] : [];
  }
  if (p.kind === "unsupported")
    return [];
  return [`.mask { ${paintExpr(p, n.frame.w, n.frame.h, ctx)} }`];
}

// src/swift/shadows.ts
function outerShadowModifiers(n, ctx) {
  const result = [];
  const box = shapeExpr(n.style, n.frame.w, n.frame.h);
  for (const s of n.style.shadows.filter((s) => !s.inset && s.color.a > 0)) {
    const silhouette = insetShape(n, [-s.spread, -s.spread, -s.spread, -s.spread]);
    const body = [
      "ZStack {",
      ...indent([
        `${silhouette}.fill(${colorExpr(s.color, ctx, n.id)})`,
        ...s.spread ? [`.padding(${num3(-s.spread)})`] : [],
        ...s.blur ? [`.blur(radius: ${num3(s.blur / 2)})`] : [],
        `.offset(x: ${num3(s.x)}, y: ${num3(s.y)})`,
        `${box}.fill(Color.black)`,
        ".blendMode(.destinationOut)"
      ], 1),
      "}",
      ".compositingGroup()"
    ];
    result.push(".background {", ...indent(body, 1), "}");
  }
  return result;
}
function insetShadowModifiers(n, ctx) {
  const result = [];
  const edge = borderInsets(n.style);
  const mask = `${insetShape(n, edge)}.fill(Color.black)${padding(edge)}`;
  for (const s of n.style.shadows.filter((s) => s.inset && s.color.a > 0)) {
    const hole = edge.map((v) => v + s.spread);
    const flood = Math.max(n.frame.w, n.frame.h) + Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.spread) + s.blur * 3;
    const body = [
      "ZStack {",
      ...indent([
        `Rectangle().fill(${colorExpr(s.color, ctx, n.id)}).padding(${num3(-flood)})`,
        `${insetShape(n, hole)}.fill(Color.black)${padding(hole)}`,
        `.offset(x: ${num3(s.x)}, y: ${num3(s.y)})`,
        ".blendMode(.destinationOut)"
      ], 1),
      "}",
      ".compositingGroup()",
      ...s.blur ? [`.blur(radius: ${num3(s.blur / 2)})`] : [],
      ".mask(alignment: .center) {",
      ...indent([mask], 1),
      "}"
    ];
    result.push(".background {", ...indent(body, 1), "}");
  }
  return result;
}
function borderInsets(st) {
  if (st.border)
    return [st.border.width, st.border.width, st.border.width, st.border.width];
  const b = st.borderSides;
  return [b?.top?.width ?? 0, b?.right?.width ?? 0, b?.bottom?.width ?? 0, b?.left?.width ?? 0];
}
function insetShape(n, inset) {
  const [t, r, b, l] = inset;
  const st = { ...n.style };
  if (st.radius) {
    const shrink = [Math.max(t, l), Math.max(t, r), Math.max(b, r), Math.max(b, l)];
    st.radius = st.radius.map((v, i) => v > 0 ? Math.max(0, v - shrink[i]) : 0);
  }
  return shapeExpr(st, Math.max(0, n.frame.w - l - r), Math.max(0, n.frame.h - t - b));
}
function padding(inset) {
  const [t, r, b, l] = inset;
  if (t === 0 && r === 0 && b === 0 && l === 0)
    return "";
  return t === r && r === b && b === l ? `.padding(${num3(t)})` : `.padding(EdgeInsets(top: ${num3(t)}, leading: ${num3(l)}, bottom: ${num3(b)}, trailing: ${num3(r)}))`;
}

// src/swift/modifiers.ts
function modifiers(n, ctx) {
  const m = [];
  const st = n.style;
  const [pt, pr, pb, pl] = n.padding;
  if (pt || pr || pb || pl) {
    if (pt === pr && pr === pb && pb === pl)
      m.push(`.padding(${num3(pt)})`);
    else
      m.push(`.padding(EdgeInsets(top: ${num3(pt)}, leading: ${num3(pl)}, bottom: ${num3(pb)}, trailing: ${num3(pr)}))`);
  }
  m.push(...frameModifier(n, ctx));
  if (n.kind === "image" && (n.contentMode === "fill" || n.contentMode === "none") && !st.clip)
    m.push(".clipped()");
  const shape = shapeExpr(st, n.frame.w, n.frame.h);
  for (const o of [...n.overlays.filter((o) => o.layer === "background")].reverse())
    m.push(...overlayModifier(o, "background", ctx));
  m.push(...insetShadowModifiers(n, ctx));
  if (st.fills.some((f) => f.kind !== "unsupported" && f.blend))
    m.push(...blendedFillModifier(st.fills, n, shape, ctx));
  else
    for (const f of [...st.fills].reverse())
      m.push(...fillModifier(f, n, shape, ctx));
  if (st.clip || st.radius && (n.kind === "stack" || n.kind === "grid") && n.overlays.length)
    m.push(`.clipShape(${shape})`);
  if (st.border) {
    const b = st.border;
    m.push(b.dashed ? `.overlay(${shape}.strokeBorder(${colorExpr(b.color, ctx, n.id)}, style: StrokeStyle(lineWidth: ${num3(b.width)}, dash: [${num3(b.width * 3)}, ${num3(b.width * 2)}])))` : `.overlay(${shape}.strokeBorder(${colorExpr(b.color, ctx, n.id)}, lineWidth: ${num3(b.width)}))`);
  } else if (st.borderSides)
    m.push(...borderSideModifiers(n, ctx));
  if (st.outline && st.outline.width > 0 && st.outline.color.a > 0) {
    const o = st.outline;
    if (o.style === "double")
      note(n, "approximated: outline-style double drawn solid");
    const dash = o.style === "dashed" ? `, dash: [${num3(o.width * 3)}, ${num3(o.width * 2)}]` : o.style === "dotted" ? `, lineCap: .round, dash: [0.01, ${num3(o.width * 2)}]` : "";
    m.push(`.overlay(${shape}.inset(by: ${num3(-(o.offset + o.width / 2))}).stroke(${colorExpr(o.color, ctx, n.id)}, style: StrokeStyle(lineWidth: ${num3(o.width)}${dash})))`);
  }
  m.push(...outerShadowModifiers(n, ctx));
  for (const o of n.overlays.filter((o) => o.layer === "overlay"))
    m.push(...overlayModifier(o, "overlay", ctx));
  if (st.filters)
    for (const f of st.filters)
      m.push(...filterModifier(f, n, ctx));
  if (st.clipPath)
    m.push(clipPathModifier(st.clipPath, n, ctx));
  if (st.mask)
    m.push(...maskModifier(st.mask, n, ctx));
  const nativeDim = ctx.mode === "app" && n.kind === "control" && n.disabled === true;
  if (st.opacity !== undefined && !nativeDim)
    m.push(`.opacity(${num3(st.opacity)})`);
  if (st.blur !== undefined)
    m.push(`.blur(radius: ${num3(st.blur)})`);
  if (st.blend) {
    const mode = swiftBlend(st.blend);
    if (mode)
      m.push(`.blendMode(${mode})`);
  }
  if (st.transform) {
    const t = st.transform;
    if (t.skewX !== undefined || t.skewY !== undefined)
      m.push(affineModifier(t, n.frame.w, n.frame.h));
    else {
      const anchor = t.origin ? `UnitPoint(x: ${num3(n.frame.w ? t.origin[0] / n.frame.w : 0.5)}, y: ${num3(n.frame.h ? t.origin[1] / n.frame.h : 0.5)})` : ".center";
      if (t.scaleX !== 1 || t.scaleY !== 1)
        m.push(`.scaleEffect(x: ${num3(t.scaleX)}, y: ${num3(t.scaleY)}, anchor: ${anchor})`);
      if (t.rotate !== 0)
        m.push(`.rotationEffect(.degrees(${num3(t.rotate)}), anchor: ${anchor})`);
      if (t.tx !== 0 || t.ty !== 0)
        m.push(`.offset(x: ${num3(t.tx)}, y: ${num3(t.ty)})`);
    }
  }
  if (n.selfAlign)
    m.push(`.frame(maxWidth: .infinity, alignment: ${n.selfAlign === "center" ? ".center" : ".trailing"})`);
  if (st.hidden)
    m.push(".hidden()");
  return m;
}
function overlayModifier(o, mode, ctx) {
  const inner = ctx.renderNode(o.node).split(`
`);
  const body = o.covers ? inner : [...inner, `.offset(x: ${num3(o.offset[0])}, y: ${num3(o.offset[1])})`];
  return [`.${mode}(alignment: .topLeading) {`, ...indent(body, 1), `}`];
}

// src/swift/nodes.ts
function refOf(n, ctx) {
  if (n.kind === "stack" || n.kind === "grid")
    return ctx.nameOf.get(n);
  return leafExpr(n, ctx).join(`
`);
}
function leafExpr(n, ctx) {
  let core;
  switch (n.kind) {
    case "text":
      core = textExpr(n, ctx);
      break;
    case "svg":
      core = svgExpr(n, ctx.shapes, ctx, n.id);
      break;
    case "image":
      core = imageNodeExpr(n, ctx);
      break;
    case "control":
      core = controlExpr(n, { child: (c) => ctx.renderNode(c).split(`
`), stateOf: ctx.control.stateOf, actionOf: ctx.control.actionOf, mode: ctx.mode, theme: ctx.screen.theme, tokens: ctx.tokens, id: n.id });
      break;
    case "box":
      core = ["Color.clear"];
      break;
    default:
      core = ["EmptyView()"];
  }
  return [...core, ...modifiers(n, ctx)];
}

// src/swift/measured-layout.ts
function measuredLayoutExpr(n, ctx) {
  const layout = n.measured;
  const out = [`MarkswiftMeasuredLayout(width: ${num3(layout.width)}, height: ${num3(layout.height)}, frames: [`];
  for (const frame of layout.frames)
    out.push(`    CGRect(x: ${num3(frame.x)}, y: ${num3(frame.y)}, width: ${num3(frame.w)}, height: ${num3(frame.h)}),`);
  out.push("]) {");
  for (const child of n.children)
    out.push(...indent(ctx.renderNode(child).split(`
`), 1));
  out.push("}");
  return out;
}

// src/swift/wrapping.ts
function wrappingExpr(n, ctx) {
  const gap = n.wrap;
  const horizontal = n.distribution === "center" ? ".center" : n.distribution === "end" ? ".trailing" : ".leading";
  const vertical = n.align === "center" ? ".center" : n.align === "end" ? ".bottom" : ".top";
  const out = [`MarkswiftFlow(columnGap: ${num3(gap.columnGap)}, rowGap: ${num3(gap.rowGap)}, horizontal: ${horizontal}, vertical: ${vertical}) {`];
  for (const child of n.children)
    out.push(...indent([
      ...ctx.renderNode(child).split(`
`),
      `.frame(width: ${num3(child.frame.w)}, height: ${num3(child.frame.h)}, alignment: .topLeading)`
    ], 1));
  out.push("}");
  return out;
}

// src/swift/layout.ts
function containerExpr(n, ctx) {
  const out = [];
  if (n.measured)
    out.push(...measuredLayoutExpr(n, ctx));
  else if (n.kind === "stack" && n.wrap)
    out.push(...wrappingExpr(n, ctx));
  else if (n.kind === "grid") {
    out.push(`Grid(alignment: .topLeading, horizontalSpacing: ${num3(n.hSpacing)}, verticalSpacing: ${num3(n.vSpacing)}) {`);
    for (let i = 0;i < n.children.length; i += n.columns) {
      out.push("    GridRow {");
      for (const c of n.children.slice(i, i + n.columns))
        out.push(...indent(ctx.renderNode(c).split(`
`), 2));
      out.push("    }");
    }
    out.push("}");
  } else {
    const kids = n.children;
    const uniform = typeof n.spacing === "number";
    const spacers = n.distribution === "between" || n.distribution === "around" || n.distribution === "evenly";
    const spacing = spacers ? 0 : uniform ? n.spacing : 0;
    const geometry = ctx.mode === "fidelity" && n.axis === "h" && n.align !== "stretch";
    const align = n.axis === "v" ? vAlign(n.align) : geometry ? ".top" : hAlign(n.align);
    const ctor = n.axis === "v" ? `VStack(alignment: ${align}, spacing: ${num3(spacing)})` : `HStack(alignment: ${align}, spacing: ${num3(spacing)})`;
    out.push(`${ctor} {`);
    const around = n.distribution === "around", evenly = n.distribution === "evenly";
    kids.forEach((c, i) => {
      if (i > 0 && n.distribution === "between" || around || evenly)
        out.push("    Spacer(minLength: 0)");
      const lines = ctx.renderNode(c).split(`
`);
      const extra = [];
      if (geometry) {
        const dy = Math.round((c.frame.y - (n.frame.y + n.padding[0])) * 100) / 100;
        if (dy > 0.5)
          extra.push(`.padding(.top, ${num3(dy)})`);
      }
      if (i === 0 && n.leadInset !== 0 && !around && !evenly)
        extra.push(`.padding(${n.axis === "v" ? ".top" : ".leading"}, ${num3(n.leadInset)})`);
      if (!uniform && !spacers && i > 0)
        extra.push(`.padding(${n.axis === "v" ? ".top" : ".leading"}, ${num3(n.spacing[i - 1] ?? 0)})`);
      out.push(...indent([...lines, ...extra], 1));
      if (around || evenly && i === kids.length - 1)
        out.push("    Spacer(minLength: 0)");
    });
    out.push("}");
    if (n.axis === "h" && n.height.kind === "hug" && kids.some((k) => k.height.kind === "fill"))
      out.push(".fixedSize(horizontal: false, vertical: true)");
  }
  out.push(...modifiers(n, ctx));
  if (n.kind === "stack" && n.scroll) {
    if (ctx.mode === "fidelity")
      return [...out, `.frame(width: ${num3(n.frame.w)}, height: ${num3(n.frame.h)}, alignment: .topLeading)`, ".clipped()"];
    return [`ScrollView(.${n.scroll === "h" ? "horizontal" : "vertical"}, showsIndicators: false) {`, ...indent(out, 1), `}`];
  }
  return out;
}
function vAlign(a) {
  return a === "center" ? ".center" : a === "end" ? ".trailing" : ".leading";
}
function hAlign(a) {
  return a === "center" ? ".center" : a === "end" ? ".bottom" : a === "baseline" ? ".firstTextBaseline" : ".top";
}

// src/swift/traversal.ts
var visit = (n, fn) => {
  fn(n);
  if (n.kind === "stack" || n.kind === "grid")
    for (const c of n.children)
      visit(c, fn);
  if (n.kind === "control") {
    if (n.label)
      visit(n.label, fn);
    for (const c of n.content)
      visit(c, fn);
  }
  for (const o of n.overlays)
    visit(o.node, fn);
};

// src/swift/measured-runtime.ts
var MEASURED_LAYOUT_RUNTIME = `
struct MarkswiftMeasuredLayout: Layout {
    var width: CGFloat
    var height: CGFloat
    var frames: [CGRect]

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for (index, subview) in subviews.enumerated() where index < frames.count {
            let frame = frames[index]
            subview.place(at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
                          anchor: .topLeading, proposal: ProposedViewSize(width: frame.width, height: frame.height))
        }
    }
}
`;

// src/swift/flow-runtime.ts
var FLOW_RUNTIME = `
struct MarkswiftFlow: Layout {
    var columnGap: CGFloat
    var rowGap: CGFloat
    var horizontal: HorizontalAlignment = .leading
    var vertical: VerticalAlignment = .top

    private struct Item {
        var index: Int
        var size: CGSize
    }

    private struct Row {
        var items: [Item] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let available = finiteWidth(proposal.width)
        let rows = rows(width: available ?? .infinity, subviews: subviews)
        let width = available ?? rows.map { $0.width }.max() ?? 0
        let height = rows.reduce(CGFloat(0)) { $0 + $1.height } + CGFloat(max(0, rows.count - 1)) * rowGap
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = rows(width: max(0, bounds.width), subviews: subviews)
        var y = bounds.minY
        for row in rows {
            let remaining = bounds.width - row.width
            var x = bounds.minX + (horizontal == .center ? remaining / 2 : horizontal == .trailing ? remaining : 0)
            for item in row.items {
                let slack = row.height - item.size.height
                let dy = vertical == .center ? slack / 2 : vertical == .bottom ? slack : 0
                subviews[item.index].place(at: CGPoint(x: x, y: y + dy), anchor: .topLeading,
                                          proposal: ProposedViewSize(width: item.size.width, height: item.size.height))
                x += item.size.width + columnGap
            }
            y += row.height + rowGap
        }
    }

    private func finiteWidth(_ value: CGFloat?) -> CGFloat? {
        guard let value, value.isFinite else { return nil }
        return max(0, value)
    }

    private func rows(width: CGFloat, subviews: Subviews) -> [Row] {
        var result: [Row] = []
        var row = Row()
        for (index, subview) in subviews.enumerated() {
            let measured = subview.sizeThatFits(.unspecified)
            let size = CGSize(width: measured.width.isFinite ? max(0, measured.width) : 0,
                              height: measured.height.isFinite ? max(0, measured.height) : 0)
            let gap = row.items.isEmpty ? 0 : columnGap
            if !row.items.isEmpty && row.width + gap + size.width > width + 0.0001 {
                result.append(row)
                row = Row()
            }
            row.width += (row.items.isEmpty ? 0 : columnGap) + size.width
            row.height = max(row.height, size.height)
            row.items.append(Item(index: index, size: size))
        }
        if !row.items.isEmpty { result.append(row) }
        return result
    }
}
`;

// src/swift/greedy-text-runtime.ts
var GREEDY_TEXT_RUNTIME = `
struct MarkswiftGreedyText: View {
    let value: String
    let font: Font
    let color: Color
    let fontSize: CGFloat
    let lineGap: CGFloat

    init(_ value: String, font: Font, color: Color, fontSize: CGFloat, lineGap: CGFloat) {
        self.value = value
        self.font = font
        self.color = color
        self.fontSize = fontSize
        self.lineGap = lineGap
    }

    var body: some View {
        let words = value.split(separator: " ")
        MarkswiftFlow(columnGap: fontSize * 0.25, rowGap: lineGap) {
            ForEach(words.indices, id: \\.self) { index in
                Text(verbatim: String(words[index]))
                    .font(font)
                    .foregroundStyle(color)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(value)
    }
}
`;

// src/swift/relative-width-runtime.ts
var RELATIVE_WIDTH_RUNTIME = `
struct MarkswiftRelativeWidth: ViewModifier {
    let fraction: CGFloat
    let capturedWidth: CGFloat

    func body(content: Content) -> some View {
        MarkswiftRelativeWidthLayout(fraction: fraction, capturedWidth: capturedWidth) { content }
    }
}

private struct MarkswiftRelativeWidthLayout: Layout {
    let fraction: CGFloat
    let capturedWidth: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let child = subviews.first else { return .zero }
        let width: CGFloat
        if let available = proposal.width, available.isFinite {
            width = max(0, available * fraction)
        } else {
            width = max(0, capturedWidth)
        }
        let size = child.sizeThatFits(ProposedViewSize(width: width, height: proposal.height))
        return CGSize(width: width, height: size.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let child = subviews.first else { return }
        child.place(at: bounds.origin, anchor: .topLeading,
                    proposal: ProposedViewSize(width: bounds.width, height: bounds.height))
    }
}
`;

// src/swift/runtime.ts
var SWIFT_RUNTIME = `// Generated by Markswift — runtime helpers shared by all generated views.
import SwiftUI
import CoreText

extension Color {
    /// sRGB components 0…1, as measured from the design's computed styles.
    nonisolated static func markswift(_ r: Double, _ g: Double, _ b: Double, _ a: Double = 1) -> Color {
        Color(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}

extension Font {
    /// A bundled variable font at an exact \`wght\` (and optional \`opsz\`) axis value — the same
    /// instance the browser rendered, instead of the nearest named weight.
    nonisolated static func markswiftVariable(_ family: String, size: CGFloat, weight: CGFloat, opsz: CGFloat? = nil) -> Font {
        var axes: [Int: CGFloat] = [0x7767_6874: weight] // 'wght'
        if let opsz { axes[0x6F70_737A] = opsz }          // 'opsz'
        let attrs: [UIFontDescriptor.AttributeName: Any] = [
            .family: family,
            UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): axes,
        ]
        let descriptor = UIFontDescriptor(fontAttributes: attrs)
        return Font(UIFont(descriptor: descriptor, size: size))
    }
}

extension Text {
    /// A URL-bearing span inside a styled paragraph. AttributedString keeps the link
    /// interactive after the span is concatenated with its neighbouring Text runs.
    nonisolated static func markswiftLink(_ value: String, _ destination: String) -> Text {
        var attributed = AttributedString(value)
        attributed.link = URL(string: destination)
        return Text(attributed)
    }

    /// Pure horizontal advance inside a concatenated \`Text\`: the padding and border of an inline
    /// element, which a native text run cannot carry as a box. CoreText drops zero-width
    /// characters and their kerning with them, so the advance rides on a no-break space in a font
    /// too small to have an advance of its own — exact, family-independent, and no line-break
    /// opportunity where CSS has none.
    nonisolated static func markswiftGap(_ width: CGFloat) -> Text {
        Text(verbatim: "\\u{00A0}").font(.system(size: 0.01)).kerning(width)
    }

    /// U+200F RIGHT-TO-LEFT MARK, in a font too small to touch the line metrics: the strong
    /// right-to-left character that gives an all-Latin paragraph inside an RTL block the base
    /// direction the browser gave it, so its trailing punctuation lands on the left.
    nonisolated static var markswiftRTL: Text {
        Text(verbatim: "\\u{200F}").font(.system(size: 0.01))
    }

    /// A paragraph's runs as one \`Text\`. The fold is the same \`+\` a hand-written concatenation
    /// uses; the array is what keeps the Swift type checker out of trouble, since a literal
    /// \`Text + Text + …\` chain is a single expression whose solving cost grows superlinearly
    /// with the number of runs and exhausts the solver's budget at fourteen of them.
    nonisolated static func markswiftRuns(_ runs: [Text]) -> Text {
        runs.dropFirst().reduce(runs.first ?? Text(verbatim: "")) { $0 + $1 }
    }
}

extension Image {
    /// A raster image inlined as base64 (a \`data:\` URL in the design). Falls back to a system
    /// placeholder instead of trapping when the payload is not an image UIKit can decode.
    nonisolated static func markswiftData(_ base64: String) -> Image {
        if let data = Data(base64Encoded: base64), let image = UIImage(data: data) {
            return Image(uiImage: image)
        }
        return Image(systemName: "photo")
    }
}

/// A straight line along the middle of its rect, parallel to \`edge\` — per-side dashed and
/// dotted borders are strokes of this shape aligned to that edge.
nonisolated struct MarkswiftEdgeLine: Shape {
    let edge: Edge
    func path(in rect: CGRect) -> Path {
        var p = Path()
        switch edge {
        case .top, .bottom:
            p.move(to: CGPoint(x: rect.minX, y: rect.midY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        case .leading, .trailing:
            p.move(to: CGPoint(x: rect.midX, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        }
        return p
    }
}

/// The CSS border area of the sides listed in \`sides\` (0 top, 1 trailing, 2 bottom, 3 leading)
/// on a box with \`radii\` corners (clockwise from top-left) and per-side \`widths\`.
///
/// The region is the ring between the box outline and the outline inset by the border widths —
/// whose corner curves share their centres with the outer ones, which is what makes the inner
/// curve elliptical wherever two adjacent widths differ — cut at each corner by the line from
/// the border-box corner through the padding-box corner. That line is where CSS hands a corner
/// from one side to the next, so a side whose neighbour has no border keeps the whole arc and
/// tapers into it, instead of stopping square at the start of the curve.
///
/// \`band\` narrows the ring to a fraction of each width (\`border-style: double\` fills
/// 0…1/3 and 2/3…1). \`dash\` replaces the filled ring with a dash pattern stroked along the
/// ring's centre line, so dashed and dotted edges follow the curve too.
nonisolated struct MarkswiftBorderSides: Shape {
    var radii: [CGFloat]
    var widths: [CGFloat]
    var sides: [Int]
    var band: ClosedRange<CGFloat> = 0...1
    var dash: [CGFloat] = []
    var roundCaps = false

    func path(in rect: CGRect) -> Path {
        guard radii.count == 4, widths.count == 4 else { return Path() }
        let ring = dash.isEmpty
            ? Self.outline(rect, radii, widths.map { $0 * band.lowerBound })
                .subtracting(Self.outline(rect, radii, widths.map { $0 * band.upperBound }))
            : Self.outline(rect, radii, widths.map { $0 / 2 })
        var result = Path()
        for side in sides where side >= 0 && side < 4 {
            let painted = dash.isEmpty
                ? ring
                // Materialise the dashed stroke before the Boolean intersection. SwiftUI's
                // strokedPath retains a stroke wrapper; on iOS the intersection instead fills
                // its closed centreline, losing both the dash gaps and the border's width.
                : Path(ring.cgPath.copy(dashingWithPhase: 0, lengths: dash)
                    .copy(strokingWithWidth: widths[side], lineCap: roundCaps ? .round : .butt,
                          lineJoin: .miter, miterLimit: 10))
            let wedge = Self.wedge(rect, radii, widths, side)
            guard !wedge.isEmpty else { continue }
            result.addPath(painted.intersection(wedge))
        }
        return result
    }

    /// Rounded outline of \`rect\` inset per side (top, trailing, bottom, leading). The corner
    /// centres stay put, so each radius loses the inset of the edge it runs into — horizontally
    /// the leading/trailing inset, vertically the top/bottom one.
    private static func outline(_ rect: CGRect, _ r: [CGFloat], _ inset: [CGFloat]) -> Path {
        let x0 = rect.minX + inset[3], x1 = rect.maxX - inset[1]
        let y0 = rect.minY + inset[0], y1 = rect.maxY - inset[2]
        guard x1 > x0, y1 > y0 else { return Path() }
        let hx = (x1 - x0) / 2, hy = (y1 - y0) / 2
        let sideInset = [inset[3], inset[1], inset[1], inset[3]]
        let capInset = [inset[0], inset[0], inset[2], inset[2]]
        let rx = (0..<4).map { min(hx, max(0, r[$0] - sideInset[$0])) }
        let ry = (0..<4).map { min(hy, max(0, r[$0] - capInset[$0])) }
        // Cubic control arm for a quarter ellipse.
        let k: CGFloat = 0.5522847498307936
        var p = Path()
        p.move(to: CGPoint(x: x0 + rx[0], y: y0))
        p.addLine(to: CGPoint(x: x1 - rx[1], y: y0))
        Self.corner(&p, CGPoint(x: x1 - rx[1], y: y0 + ry[1]), rx[1], ry[1], 1, k)
        p.addLine(to: CGPoint(x: x1, y: y1 - ry[2]))
        Self.corner(&p, CGPoint(x: x1 - rx[2], y: y1 - ry[2]), rx[2], ry[2], 2, k)
        p.addLine(to: CGPoint(x: x0 + rx[3], y: y1))
        Self.corner(&p, CGPoint(x: x0 + rx[3], y: y1 - ry[3]), rx[3], ry[3], 3, k)
        p.addLine(to: CGPoint(x: x0, y: y0 + ry[0]))
        Self.corner(&p, CGPoint(x: x0 + rx[0], y: y0 + ry[0]), rx[0], ry[0], 0, k)
        p.closeSubpath()
        return p
    }

    /// One clockwise quarter of the ellipse centred at \`c\`, for corner \`i\` (0 tl … 3 bl).
    private static func corner(_ p: inout Path, _ c: CGPoint, _ rx: CGFloat, _ ry: CGFloat, _ i: Int, _ k: CGFloat) {
        let sx: CGFloat = i == 1 || i == 2 ? 1 : -1   // trailing corners curve to the right
        let sy: CGFloat = i >= 2 ? 1 : -1             // bottom corners curve downwards
        // The outline is walked clockwise from the top-left corner's end: tl and br arrive along
        // a vertical edge and leave along a horizontal one, tr and bl the other way round.
        let endsOnTheSide = i == 1 || i == 3
        let end = endsOnTheSide
            ? CGPoint(x: c.x + sx * rx, y: c.y)
            : CGPoint(x: c.x, y: c.y + sy * ry)
        if rx <= 0 || ry <= 0 {
            p.addLine(to: end)
            return
        }
        // Control arms run from the entry tangent to the exit tangent of the quarter ellipse.
        let c1 = endsOnTheSide
            ? CGPoint(x: c.x + sx * rx * k, y: c.y + sy * ry)
            : CGPoint(x: c.x + sx * rx, y: c.y + sy * ry * k)
        let c2 = endsOnTheSide
            ? CGPoint(x: c.x + sx * rx, y: c.y + sy * ry * k)
            : CGPoint(x: c.x + sx * rx * k, y: c.y + sy * ry)
        p.addCurve(to: end, control1: c1, control2: c2)
    }

    /// The part of the box that belongs to \`side\`: its own band of the border area, clipped at
    /// each of its two corners by the hand-over line, keeping the half that contains the edge's
    /// midpoint.
    ///
    /// The band matters. Two hand-over lines alone do not partition the ring — on a box much
    /// wider than it is tall the lines from the two top corners never meet inside it, so the
    /// "top" half-planes also contain the bottom edge and the top border would be painted over
    /// the bottom one. A side's border can only ever lie within its own width or the reach of
    /// its two corner arcs, so that band is the bound that makes the partition disjoint.
    private static func wedge(_ rect: CGRect, _ r: [CGFloat], _ w: [CGFloat], _ side: Int) -> Path {
        let corners = [
            CGPoint(x: rect.minX, y: rect.minY), CGPoint(x: rect.maxX, y: rect.minY),
            CGPoint(x: rect.maxX, y: rect.maxY), CGPoint(x: rect.minX, y: rect.maxY),
        ]
        // Corner j points at the padding-box corner: leading/trailing width in x, top/bottom in y.
        let rays = [
            CGVector(dx: w[3], dy: w[0]), CGVector(dx: -w[1], dy: w[0]),
            CGVector(dx: -w[1], dy: -w[2]), CGVector(dx: w[3], dy: -w[2]),
        ]
        let mid = [
            CGPoint(x: rect.midX, y: rect.minY), CGPoint(x: rect.maxX, y: rect.midY),
            CGPoint(x: rect.midX, y: rect.maxY), CGPoint(x: rect.minX, y: rect.midY),
        ][side]
        let reach = min(side % 2 == 0 ? rect.height : rect.width, max(w[side], max(r[side], r[(side + 1) % 4])))
        let band: CGRect
        switch side {
        case 0: band = CGRect(x: rect.minX, y: rect.minY, width: rect.width, height: reach)
        case 1: band = CGRect(x: rect.maxX - reach, y: rect.minY, width: reach, height: rect.height)
        case 2: band = CGRect(x: rect.minX, y: rect.maxY - reach, width: rect.width, height: reach)
        default: band = CGRect(x: rect.minX, y: rect.minY, width: reach, height: rect.height)
        }
        var poly = [
            CGPoint(x: band.minX, y: band.minY), CGPoint(x: band.maxX, y: band.minY),
            CGPoint(x: band.maxX, y: band.maxY), CGPoint(x: band.minX, y: band.maxY),
        ]
        for j in [side, (side + 1) % 4] {
            poly = Self.clip(poly, corners[j], rays[j], keeping: mid)
            if poly.count < 3 { return Path() }
        }
        var p = Path()
        p.addLines(poly)
        p.closeSubpath()
        return p
    }

    /// Sutherland–Hodgman clip of a convex polygon by the half-plane of the line through
    /// \`origin\` along \`dir\` that contains \`keeping\`.
    private static func clip(_ poly: [CGPoint], _ origin: CGPoint, _ dir: CGVector, keeping: CGPoint) -> [CGPoint] {
        let nx = dir.dy, ny = -dir.dx
        let raw = { (p: CGPoint) in (p.x - origin.x) * nx + (p.y - origin.y) * ny }
        let sign: CGFloat = raw(keeping) < 0 ? -1 : 1
        let side = { (p: CGPoint) in sign * raw(p) }
        var out: [CGPoint] = []
        for (i, a) in poly.enumerated() {
            let b = poly[(i + 1) % poly.count]
            let da = side(a), db = side(b)
            if da >= 0 { out.append(a) }
            if (da < 0) != (db < 0) {
                let t = da / (da - db)
                out.append(CGPoint(x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y)))
            }
        }
        return out
    }
}

/// \`background-repeat\`: draws \`content\` at \`tile\` size across the whole view, starting at
/// \`origin\` (the CSS background-position) and repeating along \`axes\`.
struct MarkswiftTile<Content: View>: View {
    let tile: CGSize
    var origin: CGPoint = .zero
    var axes: Axis.Set = [.horizontal, .vertical]
    @ViewBuilder let content: () -> Content

    var body: some View {
        Canvas { context, size in
            guard tile.width > 0, tile.height > 0, let symbol = context.resolveSymbol(id: 0) else { return }
            let x0 = axes.contains(.horizontal) ? origin.x.truncatingRemainder(dividingBy: tile.width) - tile.width : origin.x
            let y0 = axes.contains(.vertical) ? origin.y.truncatingRemainder(dividingBy: tile.height) - tile.height : origin.y
            var y = y0
            repeat {
                var x = x0
                repeat {
                    context.draw(symbol, in: CGRect(x: x, y: y, width: tile.width, height: tile.height))
                    x += tile.width
                } while axes.contains(.horizontal) && x < size.width
                y += tile.height
            } while axes.contains(.vertical) && y < size.height
        } symbols: {
            content().frame(width: tile.width, height: tile.height).tag(0)
        }
    }
}

enum MarkswiftFonts {
    /// Registers bundled font files with CoreText. Call once before rendering.
    static func register(urls: [URL]) {
        for url in urls {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }
}
${CONTROL_RUNTIME}
${MEASURED_LAYOUT_RUNTIME}
${FLOW_RUNTIME}
${GREEDY_TEXT_RUNTIME}
${RELATIVE_WIDTH_RUNTIME}`;

// src/swift/emit.ts
function emitSwift(screen, viewName, opts) {
  const shapes = {};
  const report = [];
  const mapping = { total: 0, mapped: 0, approximated: 0, unmapped: 0 };
  const props = [];
  const seen = {};
  visit(screen.root, (n) => {
    if (n.kind !== "stack" && n.kind !== "grid")
      return;
    const base = propName(n.id, props.length);
    const k = seen[base] = (seen[base] ?? 0) + 1;
    props.push({ name: k === 1 ? base : `${base}_r${k}`, node: n });
  });
  const nameOf = new Map;
  for (const p of props)
    nameOf.set(p.node, p.name);
  const control = controlMembers(screen.root);
  const ctx = { fontMetrics: opts.fontMetrics ?? {}, nameOf, shapes, screen, mode: opts.mode, control, tokens: opts.tokens, renderNode: (node) => refOf(node, ctx) };
  const w = new Writer;
  const comment = (value) => value.replace(/[\r\n\u2028\u2029]/g, " ");
  w.line("// Generated by Markswift — do not edit. Source: " + comment(screen.source) + " (" + comment(screen.name) + ", " + screen.theme + ")");
  w.line("import SwiftUI");
  w.line();
  w.block(`struct ${viewName}: View {`, () => {
    for (const d of control.decls)
      w.line(d);
    if (control.decls.length)
      w.line();
    w.block("var body: some View {", () => {
      w.line(refOf(screen.root, ctx));
    });
    for (const p of props) {
      w.line();
      w.line(`// ${comment(p.node.id)}`);
      w.block(`private var ${p.name}: some View {`, () => {
        for (const l of containerExpr(p.node, ctx))
          w.line(l);
      });
    }
  });
  w.line();
  w.block(`#Preview("${viewName}") {`, () => {
    w.line(`${viewName}()`);
    w.line(`.frame(width: ${num3(screen.size.w)}, height: ${num3(screen.size.h)})`);
    w.line(`.background(Color.markswift(${colorArgs(screen.theme === "dark" ? { r: 0.043, g: 0.055, b: 0.075, a: 1 } : { r: 0.957, g: 0.965, b: 0.98, a: 1 })}))`);
    w.line(`.preferredColorScheme(.${screen.theme})`);
  });
  visit(screen.root, (n) => {
    mapping.total++;
    mapping[n.confidence]++;
    if (n.confidence !== "mapped")
      report.push({ id: n.id, kind: n.kind, confidence: n.confidence, notes: n.notes });
  });
  return { view: w.toString(), shapes, report, mapping };
}
function propName(id, i) {
  const clean = id.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `v_${clean || "n" + i}`;
}

// src/swift/tokens/slots.ts
function visible(c) {
  return c !== undefined && c.a > 0;
}
function pushPaint(out, p, key, role) {
  if (p.kind === "solid") {
    if (visible(p.color))
      out.push({ key, role, color: p.color });
    return;
  }
  if (p.kind === "linear" || p.kind === "radial" || p.kind === "conic") {
    p.stops.forEach((s, j) => {
      if (visible(s.color))
        out.push({ key: `${key}.s${j}`, role, color: s.color });
    });
  }
}
function pushShadow(out, s, key) {
  if (visible(s.color))
    out.push({ key, role: "shadow", color: s.color });
}
function pushGradient(out, g, key) {
  g.stops.forEach((s, j) => {
    if (visible(s.color))
      out.push({ key: `${key}.s${j}`, role: "icon", color: s.color });
  });
}
function pushStyle(out, st) {
  st.fills.forEach((p, i) => pushPaint(out, p, `fill${i}`, "fill"));
  if (st.border && st.border.width > 0) {
    if (visible(st.border.color))
      out.push({ key: "border", role: "border", color: st.border.color });
  }
  for (const edge of ["top", "right", "bottom", "left"]) {
    const e = st.borderSides?.[edge];
    if (e && e.width > 0 && visible(e.color))
      out.push({ key: `border.${edge}`, role: "border", color: e.color });
  }
  if (st.outline && st.outline.width > 0 && visible(st.outline.color))
    out.push({ key: "outline", role: "border", color: st.outline.color });
  st.shadows.forEach((s, i) => pushShadow(out, s, `shadow${i}`));
  st.filters?.forEach((f, i) => {
    if (f.kind === "drop-shadow")
      pushShadow(out, f.shadow, `filter${i}`);
  });
}
function pushRun(out, r, i) {
  if (r.paint)
    pushPaint(out, r.paint, `run${i}.paint`, "text");
  else if (visible(r.color))
    out.push({ key: `run${i}`, role: "text", color: r.color });
  if (r.decoration && visible(r.decoration.color))
    out.push({ key: `run${i}.dec`, role: "text", color: r.decoration.color });
  if (r.shadow)
    pushShadow(out, r.shadow, `run${i}.shadow`);
}
function colorSlots(n) {
  const out = [];
  pushStyle(out, n.style);
  if (n.kind === "text")
    n.runs.forEach((r, i) => pushRun(out, r, i));
  if (n.kind === "svg") {
    n.paths.forEach((p, i) => {
      if (p.gradient)
        pushGradient(out, p.gradient, `path${i}.fill`);
      else if (visible(p.fill))
        out.push({ key: `path${i}.fill`, role: "icon", color: p.fill });
      if (p.strokeGradient)
        pushGradient(out, p.strokeGradient, `path${i}.stroke`);
      else if (visible(p.stroke))
        out.push({ key: `path${i}.stroke`, role: "icon", color: p.stroke });
    });
    n.texts?.forEach((t, i) => {
      if (visible(t.fill))
        out.push({ key: `text${i}`, role: "icon", color: t.fill });
    });
  }
  if (n.kind === "control" && visible(n.color))
    out.push({ key: "control", role: "text", color: n.color });
  if (n.kind === "image" && visible(n.color))
    out.push({ key: "alt", role: "text", color: n.color });
  return out;
}
function screenBase(screen) {
  const suffix = `-${screen.theme}`;
  return screen.name.endsWith(suffix) ? screen.name.slice(0, -suffix.length) : screen.name;
}
function screenSlots(s) {
  const out = [];
  const canvasSlot = visible(s.canvas) ? [{ key: "canvas", role: "canvas", color: s.canvas }] : [];
  out.push({ id: "#screen", hints: [], slots: canvasSlot });
  walk(s.root, (n) => out.push({ id: n.id, hints: n.style.tokens ?? [], slots: colorSlots(n) }));
  return out;
}
function pairUsages(screens) {
  const groups = new Map;
  for (const s of screens) {
    const base = screenBase(s);
    const g = groups.get(base);
    if (g)
      g.push(s);
    else
      groups.set(base, [s]);
  }
  const usages = [];
  let order = 0;
  for (const [base, group] of groups) {
    const light = group.find((s) => s.theme === "light");
    const dark = group.find((s) => s.theme === "dark");
    const primary = light ?? dark;
    const secondary = primary === light ? dark : undefined;
    const other = new Map;
    if (secondary)
      for (const n of screenSlots(secondary))
        other.set(n.id, new Map(n.slots.map((s) => [s.key, s.color])));
    const seen = new Set;
    for (const n of screenSlots(primary)) {
      const counterpart = other.get(n.id);
      for (const s of n.slots) {
        seen.add(`${n.id}\x00${s.key}`);
        usages.push({ base, theme: primary.theme, nodeId: n.id, slot: s.key, role: s.role, light: s.color, dark: counterpart?.get(s.key), hints: n.hints, order: order++ });
      }
    }
    if (secondary) {
      for (const n of screenSlots(secondary)) {
        for (const s of n.slots) {
          if (seen.has(`${n.id}\x00${s.key}`))
            continue;
          usages.push({ base, theme: secondary.theme, nodeId: n.id, slot: s.key, role: s.role, light: s.color, hints: n.hints, order: order++ });
        }
      }
    }
  }
  return usages;
}
// src/swift/tokens/naming.ts
var SWIFT_KEYWORDS = {
  associatedtype: true,
  class: true,
  deinit: true,
  enum: true,
  extension: true,
  fileprivate: true,
  func: true,
  import: true,
  init: true,
  inout: true,
  internal: true,
  let: true,
  open: true,
  operator: true,
  private: true,
  precedencegroup: true,
  protocol: true,
  public: true,
  rethrows: true,
  static: true,
  struct: true,
  subscript: true,
  typealias: true,
  var: true,
  break: true,
  case: true,
  catch: true,
  continue: true,
  default: true,
  defer: true,
  do: true,
  else: true,
  fallthrough: true,
  for: true,
  guard: true,
  if: true,
  in: true,
  repeat: true,
  return: true,
  throw: true,
  throws: true,
  try: true,
  where: true,
  while: true,
  as: true,
  false: true,
  is: true,
  nil: true,
  self: true,
  super: true,
  true: true,
  Any: true,
  Protocol: true,
  Type: true,
  some: true,
  each: true,
  borrowing: true,
  consuming: true,
  nonisolated: true
};
function camelize(name) {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!parts.length)
    return "color";
  const head = parts[0];
  const camel = head.charAt(0).toLowerCase() + head.slice(1) + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  const safe = /^\d/.test(camel) ? `c${camel}` : camel;
  return SWIFT_KEYWORDS[safe] ? `${safe}Color` : safe;
}
var HUES = [
  [15, "Red"],
  [45, "Orange"],
  [70, "Yellow"],
  [100, "Lime"],
  [160, "Green"],
  [200, "Teal"],
  [250, "Blue"],
  [280, "Indigo"],
  [320, "Purple"],
  [345, "Pink"],
  [360, "Red"]
];
var TONES = [
  [0.06, "Black"],
  [0.25, "Primary"],
  [0.5, "Secondary"],
  [0.72, "Tertiary"],
  [0.9, "Subtle"],
  [0.99, "Surface"],
  [1.01, "White"]
];
function tone(c) {
  const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
  const chroma = max - min;
  if (chroma < 0.08 || chroma / max < 0.25)
    return TONES.find(([l]) => max < l)?.[1] ?? "White";
  const h = 60 * (max === c.r ? ((c.g - c.b) / chroma + 6) % 6 : max === c.g ? (c.b - c.r) / chroma + 2 : (c.r - c.g) / chroma + 4);
  return HUES.find(([deg]) => h < deg)[1];
}
function assignHints(groups) {
  const byHint = new Map;
  const groupOf = new Map;
  for (const [g, us] of groups) {
    for (const u of us) {
      groupOf.set(`${u.nodeId}\x00${u.slot}\x00${u.order}`, g);
      for (const h of u.hints) {
        const list = byHint.get(h);
        if (list)
          list.push(u);
        else
          byHint.set(h, [u]);
      }
    }
  }
  const candidates = [];
  for (const [hint, us] of byHint) {
    const nodes = new Set(us.map((u) => u.nodeId));
    const bySlot = new Map;
    for (const u of us) {
      const g = groupOf.get(`${u.nodeId}\x00${u.slot}\x00${u.order}`);
      const cur = bySlot.get(u.slot);
      if (cur === null)
        continue;
      if (!cur)
        bySlot.set(u.slot, { group: g, nodes: new Set([u.nodeId]), order: u.order });
      else if (cur.group !== g)
        bySlot.set(u.slot, null);
      else {
        cur.nodes.add(u.nodeId);
        cur.order = Math.min(cur.order, u.order);
      }
    }
    for (const [slot, hit] of bySlot) {
      if (!hit)
        continue;
      if (nodes.size < 2 && !(us.length === 1 && us[0].hints.length === 1))
        continue;
      if (hit.nodes.size * 2 < nodes.size)
        continue;
      candidates.push({ hint, group: hit.group, nodes: hit.nodes.size, slot, order: hit.order });
    }
  }
  const ROLE_RANK = { canvas: 0, fill: 1, border: 2, text: 3, shadow: 4, icon: 5 };
  const rank = (slot) => slot.startsWith("fill") ? ROLE_RANK.fill : slot.startsWith("border") || slot === "outline" ? ROLE_RANK.border : slot.startsWith("run") ? ROLE_RANK.text : slot.startsWith("shadow") || slot.startsWith("filter") ? ROLE_RANK.shadow : slot === "canvas" ? ROLE_RANK.canvas : ROLE_RANK.icon;
  candidates.sort((a, b) => b.nodes - a.nodes || rank(a.slot) - rank(b.slot) || a.order - b.order || (a.hint < b.hint ? -1 : a.hint > b.hint ? 1 : 0));
  const named = new Map;
  const takenHints = new Set;
  for (const c of candidates) {
    if (named.has(c.group) || takenHints.has(c.hint))
      continue;
    named.set(c.group, c.hint);
    takenHints.add(c.hint);
  }
  return named;
}
// src/swift/tokens/extract.ts
function colorKey(c) {
  return `${c.r},${c.g},${c.b},${c.a}`;
}
function extractTokens(screens) {
  const usages = pairUsages(screens);
  const groups = new Map;
  for (const u of usages) {
    const l = colorKey(u.light);
    const d = u.dark ? colorKey(u.dark) : l;
    const k = d === l ? `C:${l}` : `S:${l}|${d}`;
    const g = groups.get(k);
    if (g)
      g.push(u);
    else
      groups.set(k, [u]);
  }
  const hints = assignHints(groups);
  const kept = [...groups.entries()].filter(([k, us]) => k.startsWith("S:") || us.length >= 2);
  kept.sort((a, b) => a[1][0].order - b[1][0].order);
  const used = new Set;
  const tokens = [];
  const index = new Map;
  const ambiguous = new Set;
  const put = (base, theme, id, c, name) => {
    const k = `${base}\x00${theme}\x00${id}\x00${colorKey(c)}`;
    const cur = index.get(k);
    if (cur === undefined)
      index.set(k, name);
    else if (cur !== name)
      ambiguous.add(k);
  };
  for (const [k, us] of kept) {
    const semantic = k.startsWith("S:");
    const counts = new Map;
    for (const u of us)
      counts.set(u.role, (counts.get(u.role) ?? 0) + 1);
    const role = [...counts.entries()].reduce((a, b) => b[1] > a[1] ? b : a)[0];
    const hint = hints.get(k);
    const base = hint ? camelize(hint) : role === "canvas" ? "canvas" : role + tone(us[0].light);
    let name = base;
    for (let i = 2;used.has(name); i++)
      name = `${base}${i}`;
    used.add(name);
    const uses = [];
    for (const u of us)
      if (!uses.includes(u.nodeId))
        uses.push(u.nodeId);
    for (const u of us) {
      put(u.base, u.theme, u.nodeId, u.light, name);
      if (u.dark)
        put(u.base, u.theme === "light" ? "dark" : "light", u.nodeId, u.dark, name);
    }
    tokens.push({
      name,
      kind: semantic ? "semantic" : "static",
      light: us[0].light,
      dark: semantic ? us[0].dark : us[0].light,
      role,
      ...hint ? { hint } : {},
      uses,
      slots: us.length,
      literals: us.reduce((n, u) => n + (u.dark ? 2 : 1), 0)
    });
  }
  for (const k of ambiguous)
    index.delete(k);
  const keptKeys = new Set(kept.map(([k]) => k));
  let inlineSlots = 0;
  for (const [k, us] of groups)
    if (!keptKeys.has(k))
      inlineSlots += us.length;
  return { tokens, inlineSlots, replaceableLiterals: tokens.reduce((n, t) => n + t.literals, 0), index };
}
function screenTokens(set, screen) {
  const prefix = `${screenBase(screen)}\x00${screen.theme}\x00`;
  return {
    name: (c, id) => id === undefined ? undefined : set.index.get(`${prefix}${id}\x00${colorKey(c)}`)
  };
}
// src/swift/tokens/emit.ts
var TOKENS_HEADER = `// Generated by Markswift — design tokens extracted from the light/dark pair of the run.
//
// The generated views reference these names instead of inline Color.markswift(…) literals, so one
// screen's view carries both themes. A token resolves to exactly the literal it replaced:
// measured under ImageRenderer on the simulator, token and literal render the same pixels.`;
var TOKENS_SUPPORT = `extension Color {
    /// Light/dark pair as one colour, resolved per \`UITraitCollection.userInterfaceStyle\`:
    /// it follows the system appearance, \`.preferredColorScheme\` on a hosted window, and
    /// \`\\.colorScheme\` in the environment (which is how the render harness sets the theme).
    nonisolated init(light: Color, dark: Color) {
        let l = UIColor(light), d = UIColor(dark)
        self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? d : l })
    }
}`;
function emitDesignTokens(set) {
  const semantic = set.tokens.filter((t) => t.kind === "semantic");
  const out = [
    TOKENS_HEADER,
    `//`,
    `// ${set.tokens.length} tokens: ${semantic.length} semantic (light/dark pairs), ${set.tokens.length - semantic.length} static.`,
    `// ${set.replaceableLiterals} colour slots across the run carry them; ${set.inlineSlots} single-use colours stay inline.`,
    `import SwiftUI`,
    `import UIKit`,
    ``,
    TOKENS_SUPPORT,
    ``,
    `extension Color {`
  ];
  for (const t of set.tokens) {
    const where = t.uses.length === 1 ? `1 use` : `${t.uses.length} uses`;
    out.push(`    /// ${t.role} · ${where}${t.hint ? ` · --${t.hint}` : ""}`);
    out.push(t.kind === "semantic" ? `    static let ${t.name} = Color(light: .markswift(${colorArgs(t.light)}), dark: .markswift(${colorArgs(t.dark)}))` : `    static let ${t.name} = Color.markswift(${colorArgs(t.light)})`);
  }
  out.push(`}`);
  return out.join(`
`) + `
`;
}
// src/compiler/batch.ts
function compileLayouts(inputs) {
  if (!inputs.length)
    throw new Error("compileLayouts requires at least one layout");
  const names = new Set;
  const componentThemes = new Map;
  const prepared = inputs.map((input) => {
    validateName(input.name);
    const folded = input.name.toLowerCase();
    if (names.has(folded))
      throw new Error(`Duplicate view name: ${input.name}`);
    names.add(folded);
    const doc = LayoutDoc.parse(input.layout);
    const componentId = input.componentId ?? input.name;
    if (typeof componentId !== "string" || !componentId.trim())
      throw new Error("componentId must be a non-empty string");
    const themes = componentThemes.get(componentId) ?? new Set;
    if (themes.has(doc.combo.theme))
      throw new Error(`Duplicate component theme: ${componentId} (${doc.combo.theme})`);
    themes.add(doc.combo.theme);
    componentThemes.set(componentId, themes);
    const screen = inferScreen(doc, `${componentId}-${doc.combo.theme}`, { bundledFamilies: input.bundledFamilies });
    return { input, screen };
  });
  const tokens = extractTokens(prepared.map(({ screen }) => screen));
  const files = {};
  const assets = {};
  const occupied = new Map;
  const add = (name, contents, kind, label) => {
    safePath(name);
    const key = name.toLowerCase();
    const previous = occupied.get(key);
    if (previous) {
      if (previous.name !== name)
        throw new Error(`Case-insensitive output path collision: ${previous.name} and ${name}`);
      if (previous.kind !== kind)
        throw new Error(`Conflicting ${label}: ${name} is already a ${previous.kind}`);
      if (kind === "file" && files[name] === contents)
        return;
      if (kind === "asset" && equalBytes(assets[name], contents))
        return;
      throw new Error(`Conflicting ${label}: ${name}`);
    }
    const segments = key.split("/");
    for (let count = 1;count < segments.length; count++) {
      const ancestor = occupied.get(segments.slice(0, count).join("/"));
      if (ancestor)
        throw new Error(`Output path collision (file/directory): ${ancestor.name} and ${name}`);
    }
    for (const [path, descendant] of occupied) {
      if (path.startsWith(`${key}/`))
        throw new Error(`Output path collision (file/directory): ${name} and ${descendant.name}`);
    }
    occupied.set(key, { name, kind });
    if (kind === "file") {
      if (typeof contents !== "string")
        throw new Error(`Support file must contain text: ${name}`);
      files[name] = contents;
    } else {
      if (!(contents instanceof Uint8Array))
        throw new Error(`Asset must contain bytes: ${name}`);
      assets[name] = new Uint8Array(contents);
    }
  };
  const shapes = {};
  const views = [];
  for (const { input, screen } of prepared) {
    const result = emitSwift(screen, input.name, {
      mode: input.mode ?? "app",
      tokens: screenTokens(tokens, screen),
      fontMetrics: input.fontMetrics
    });
    views.push({ name: input.name, code: result.view, diagnostics: result.report, mapping: result.mapping });
    add(`${input.name}.swift`, result.view, "file", "view file");
    for (const [name, source] of Object.entries(result.shapes)) {
      if (shapes[name] !== undefined && shapes[name] !== source)
        throw new Error(`Conflicting shape definition: ${name}`);
      shapes[name] = source;
    }
  }
  add("MarkswiftRuntime.swift", SWIFT_RUNTIME, "file", "runtime file");
  add("MarkswiftTokens.swift", emitDesignTokens(tokens), "file", "token file");
  add("MarkswiftShapes.swift", `// Generated by Markswift — SVG paths as Shapes.
import SwiftUI

` + Object.keys(shapes).sort().map((key) => shapes[key]).join(`
`), "file", "shape file");
  for (const { input } of prepared) {
    for (const [name, source] of Object.entries(input.supportFiles ?? {}))
      add(name, source, "file", "support file");
    for (const [name, bytes] of Object.entries(input.assets ?? {}))
      add(name, bytes, "asset", "asset");
  }
  return { files, assets, views };
}
function safePath(name) {
  if (!name || name.startsWith("/") || /^[A-Za-z]:/.test(name) || name.includes("\\") || name.includes("\x00") || name.split("/").some((part) => !part || part === "." || part === ".."))
    throw new Error(`Unsafe output path: ${name}`);
}
function equalBytes(a, b) {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}
// src/swift/responsive-layout.ts
var RESPONSIVE_LAYOUT_RUNTIME = `// Generated by Markswift — do not edit.
import SwiftUI

struct MarkswiftResponsiveLayout<Compact: View, Regular: View>: View {
    let breakpoint: CGFloat
    private let compact: () -> Compact
    private let regular: () -> Regular

    init(breakpoint: CGFloat, @ViewBuilder compact: @escaping () -> Compact,
         @ViewBuilder regular: @escaping () -> Regular) {
        self.breakpoint = breakpoint
        self.compact = compact
        self.regular = regular
    }

    var body: some View {
        ViewThatFits(in: .horizontal) {
            MarkswiftRegularCandidate(minWidth: breakpoint.nextUp) { regular() }
            compact()
        }
    }
}

private struct MarkswiftRegularCandidate: Layout {
    let minWidth: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let child = subviews.first else { return .zero }
        let offered = finiteWidth(proposal.width)
        let measured = child.sizeThatFits(ProposedViewSize(width: offered, height: proposal.height))
        // ViewThatFits asks for the ideal width; report the breakpoint probe rather than
        // the captured branch's intrinsic width, which can be wider than this viewport.
        return CGSize(width: max(minWidth, offered ?? minWidth), height: measured.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let child = subviews.first else { return }
        child.place(at: bounds.origin, anchor: .topLeading,
                    proposal: ProposedViewSize(width: bounds.width, height: bounds.height))
    }

    private func finiteWidth(_ width: CGFloat?) -> CGFloat? {
        guard let width, width.isFinite else { return nil }
        return max(0, width)
    }
}
`;

// src/compiler/responsive.ts
function compileResponsiveLayouts(options) {
  validateName(options.name);
  const { breakpoint, compact, regular } = options;
  if (!Number.isSafeInteger(breakpoint) || breakpoint <= 0)
    throw new Error("breakpoint must be a positive integer");
  for (const [label, capture] of [["compact", compact], ["regular", regular]]) {
    if (!Number.isFinite(capture.viewportWidth) || capture.viewportWidth <= 0) {
      throw new Error(`${label}.viewportWidth must be a positive finite number`);
    }
  }
  if (!(compact.viewportWidth <= breakpoint && breakpoint < regular.viewportWidth)) {
    throw new Error("breakpoint must satisfy compact.viewportWidth <= breakpoint < regular.viewportWidth");
  }
  const compactDoc = LayoutDoc.parse(compact.layout);
  const regularDoc = LayoutDoc.parse(regular.layout);
  if (compactDoc.combo.theme !== regularDoc.combo.theme)
    throw new Error("responsive captures must use the same theme");
  const compactName = `${options.name}Compact`;
  const regularName = `${options.name}Regular`;
  validateName(compactName);
  validateName(regularName);
  const bundle = compileLayouts([
    {
      layout: compactDoc,
      name: compactName,
      componentId: `${options.name}-compact`,
      mode: options.mode,
      bundledFamilies: options.bundledFamilies,
      fontMetrics: options.fontMetrics,
      supportFiles: options.supportFiles,
      assets: options.assets
    },
    {
      layout: regularDoc,
      name: regularName,
      componentId: `${options.name}-regular`,
      mode: options.mode,
      bundledFamilies: options.bundledFamilies,
      fontMetrics: options.fontMetrics
    }
  ]);
  const wrapperName = `${options.name}.swift`;
  const runtimeName = "MarkswiftResponsiveLayout.swift";
  for (const path of [wrapperName, runtimeName])
    rejectCollision(path, bundle);
  const code = wrapperSource(options.name, compactName, regularName, breakpoint);
  return {
    ...bundle,
    name: options.name,
    code,
    files: { ...bundle.files, [wrapperName]: code, [runtimeName]: RESPONSIVE_LAYOUT_RUNTIME }
  };
}
function rejectCollision(path, bundle) {
  const candidate = path.toLowerCase();
  for (const occupied of [...Object.keys(bundle.files), ...Object.keys(bundle.assets)]) {
    const other = occupied.toLowerCase();
    if (other === candidate || other.startsWith(`${candidate}/`) || candidate.startsWith(`${other}/`)) {
      throw new Error(`Responsive output path collision: ${path} and ${occupied}`);
    }
  }
}
function wrapperSource(name, compactName, regularName, breakpoint) {
  return `// Generated by Markswift — do not edit. Responsive captures at one breakpoint.
import SwiftUI

struct ${name}: View {
    var body: some View {
        MarkswiftResponsiveLayout(breakpoint: ${breakpoint}) {
            ${compactName}()
        } regular: {
            ${regularName}()
        }
    }
}
`;
}

// src/compiler/index.ts
function compileLayout(layout, options = {}) {
  const name = options.name ?? "ConvertedView";
  validateName(name);
  const doc = LayoutDoc.parse(layout);
  const screen = inferScreen(doc, `${doc.combo.screen}-${doc.combo.theme}`, { bundledFamilies: options.bundledFamilies });
  const tokens = extractTokens([screen]);
  const result = emitSwift(screen, name, {
    mode: options.mode ?? "app",
    tokens: screenTokens(tokens, screen),
    fontMetrics: options.fontMetrics
  });
  return {
    name,
    code: result.view,
    diagnostics: result.report,
    mapping: result.mapping,
    files: {
      [`${name}.swift`]: result.view,
      "MarkswiftRuntime.swift": SWIFT_RUNTIME,
      "MarkswiftTokens.swift": emitDesignTokens(tokens),
      "MarkswiftShapes.swift": `// Generated by Markswift — SVG paths as Shapes.
import SwiftUI

` + Object.keys(result.shapes).sort().map((key) => result.shapes[key]).join(`
`)
    }
  };
}

// src/fonts/package.ts
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join as join2 } from "node:path";

// src/fonts/source.ts
import { readFile as readFile2, readdir } from "node:fs/promises";
import { join, resolve as resolve3 } from "node:path";
function coversLatin(range) {
  if (!range)
    return true;
  for (const part of range.split(",")) {
    const m = /u\+([0-9a-f?]+)(?:-([0-9a-f]+))?/i.exec(part.trim());
    if (!m)
      continue;
    const lo = Number.parseInt(m[1].replace(/\?/g, "0"), 16);
    const hi = m[2] ? Number.parseInt(m[2], 16) : Number.parseInt(m[1].replace(/\?/g, "f"), 16);
    if (lo <= 65 && 65 <= hi)
      return true;
  }
  return false;
}
async function srcBytes(src, outDir) {
  const data = /^data:[^,]*;base64,(.*)$/s.exec(src.url);
  if (data)
    return Uint8Array.from(Buffer.from(data[1], "base64"));
  if (src.url.startsWith("data:"))
    return new TextEncoder().encode(decodeURIComponent(src.url.slice(src.url.indexOf(",") + 1)));
  if (!src.file)
    return;
  try {
    return new Uint8Array(await readFile2(resolve3(outDir, src.file)));
  } catch (error) {
    if (error.code === "ENOENT")
      return;
    throw error;
  }
}
var WEIGHT_SUBFAMILY = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Black"
};
function sanitize(family) {
  return family.replace(/[^A-Za-z0-9]/g, "") || "Font";
}

// src/fonts/converter.ts
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
async function runFontTool(src, dst, family, subfamily, rename) {
  const script = [new URL("./convert-font.py", import.meta.url), new URL("../src/fonts/convert-font.py", import.meta.url)].find((candidate) => existsSync(candidate));
  if (!script)
    return "convert-font.py is missing from the package";
  const { out, err, code } = await new Promise((done) => {
    const p = spawn("python3", [fileURLToPath(script), src, dst, family, subfamily, rename ? "1" : "0"], { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    p.stdout.on("data", (chunk) => stdout.push(chunk));
    p.stderr.on("data", (chunk) => stderr.push(chunk));
    p.once("error", (error) => done({ out: "", err: error.message, code: -1 }));
    p.once("close", (exitCode) => done({ out: Buffer.concat(stdout).toString("utf8"), err: Buffer.concat(stderr).toString("utf8"), code: exitCode ?? -1 }));
  });
  if (code !== 0)
    return (err.trim().split(`
`).pop() ?? `python3 exited ${code}`).slice(0, 200);
  try {
    return JSON.parse(out);
  } catch {
    return `unreadable fontTools output: ${out.slice(0, 120)}`;
  }
}

// src/fonts/registration.ts
function plistFragment(files) {
  if (!files.length)
    return "";
  return [
    "<!-- Generated by Markswift — merge into the app target's Info.plist. -->",
    "<key>UIAppFonts</key>",
    "<array>",
    ...files.map((f) => `    <string>Fonts/${f}</string>`),
    "</array>",
    ""
  ].join(`
`);
}
function registrationSwift(faces) {
  const entries = faces.map((f) => f.file).sort().map((f) => `        ${JSON.stringify(f)},`).join(`
`);
  const doc = faces.map((f) => `/// - ${f.family} (${f.file}): weight ${f.weight[0]}–${f.weight[1]}${f.axes["wght"] ? ", variable wght" : ""}${f.converted ? ", converted from WOFF2" : ""}${f.renamed ? ", name table rewritten so the CSS family name resolves" : ""}`).join(`
`);
  return `// Generated by Markswift — bundled webfaces of the design.
import CoreText
import SwiftUI

${doc}
public enum MarkswiftBundledFonts {
    /// File names under the \`Fonts/\` resource directory, in bundle order.
    public static let files: [String] = [
${entries}
    ]

    /// Registers every bundled face with CoreText, once per process. \`UIAppFonts\` covers the
    /// app target; this covers previews, tests and any target that loads the views from a
    /// package, where no \`Info.plist\` is read.
    public static func register(in bundle: Bundle = .main) {
        guard !registered else { return }
        registered = true
        let urls = files.compactMap { bundle.url(forResource: "Fonts/" + $0, withExtension: nil) ?? bundle.url(forResource: $0, withExtension: nil) }
        var error: Unmanaged<CFError>?
        for url in urls {
            // \`kCTFontManagerErrorAlreadyRegistered\` (105) is expected when \`UIAppFonts\`
            // already loaded the file; every other failure would mean text renders in the
            // system font, so it is surfaced instead of ignored.
            if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error), let taken = error?.takeRetainedValue() {
                let code = CFErrorGetCode(taken)
                if code != 105 { print("[markswift] font registration failed: \\(url.lastPathComponent) (\\(code))") }
                error = nil
            }
        }
    }

    private nonisolated(unsafe) static var registered = false
}
`;
}

// src/fonts/package.ts
async function packageFonts(faces, swiftDir, outDir) {
  const fontsDir = join2(swiftDir, "Fonts");
  await rm(fontsDir, { recursive: true, force: true });
  const notes = [];
  const packaged = [];
  if (!faces.length)
    return { faces: [], plist: "", swift: "", notes };
  const groups = {};
  for (const f of faces) {
    const k = `${f.family}|${f.style}|${f.weight.join("-")}`;
    (groups[k] ??= []).push(f);
  }
  await mkdir(fontsDir, { recursive: true });
  for (const k of Object.keys(groups).sort()) {
    const group = groups[k];
    const latin = group.filter((f) => coversLatin(f.unicodeRange));
    const chosen = (latin.length ? latin : group).find((f) => f.loaded) ?? (latin.length ? latin[0] : group[0]);
    if (group.length > 1) {
      notes.push(`approximated: font-family ${chosen.family} ships ${group.length} unicode-range subsets at weight ${chosen.weight.join("–")}; bundled the one covering Basic Latin, ${group.length - 1} dropped (iOS has no per-codepoint fallback inside a family)`);
    }
    if (!latin.length)
      notes.push(`unmapped: font-family ${chosen.family} declares no face covering Basic Latin; bundled its first subset`);
    let bytes;
    let usedSrc;
    for (const src of chosen.src) {
      bytes = await srcBytes(src, outDir);
      if (bytes?.length) {
        usedSrc = src;
        break;
      }
    }
    if (!bytes?.length || !usedSrc) {
      notes.push(`unmapped: font-family ${chosen.family} has no readable src (${chosen.src.map((s) => s.url.slice(0, 60)).join(", ") || "none"}) → not bundled, text falls back to the system font`);
      continue;
    }
    const sig = new TextDecoder("latin1").decode(bytes.subarray(0, 4));
    const staticWeight = chosen.weight[0] === chosen.weight[1] ? chosen.weight[0] : undefined;
    const weightName = staticWeight !== undefined && staticWeight !== 400 ? WEIGHT_SUBFAMILY[staticWeight] ?? `W${staticWeight}` : "";
    const subfamily = [weightName, chosen.style === "normal" ? "" : "Italic"].filter(Boolean).join(" ") || "Regular";
    const stem = sanitize(chosen.family) + (subfamily === "Regular" ? "" : `-${subfamily.replace(/\s+/g, "")}`);
    const file = `${stem}.${sig === "OTTO" ? "otf" : "ttf"}`;
    const dst = join2(fontsDir, file);
    const tmp = join2(fontsDir, `.${stem}.src`);
    await writeFile(tmp, bytes);
    const tool = await runFontTool(tmp, dst, chosen.family, subfamily, true);
    if (typeof tool === "string") {
      await writeFile(dst, bytes);
      await rm(tmp, { force: true });
      const fmt = sig === "wOF2" ? "WOFF2" : sig === "wOFF" ? "WOFF" : "the source format";
      notes.push(`unmapped: font-family ${chosen.family} could not be packaged (${tool}); wrote ${fmt} unconverted` + (sig === "wOF2" || sig === "wOFF" ? ` — iOS cannot register ${fmt}, so this face will not load (needs python3 with fontTools + brotli)` : ""));
      continue;
    }
    if (!tool.wrote)
      await writeFile(dst, bytes);
    await rm(tmp, { force: true });
    const metrics = { upem: tool.upem, ascent: tool.ascent, descent: tool.descent, lineGap: tool.lineGap, useTypoMetrics: tool.useTypoMetrics };
    packaged.push({ family: chosen.family, file, style: chosen.style, weight: chosen.weight, axes: tool.axes, metrics, converted: tool.converted, renamed: tool.renamed });
    if (!chosen.loaded)
      notes.push(`approximated: font-family ${chosen.family} never loaded in the reference browser, so the reference pixels are a fallback face; bundled it anyway`);
  }
  for (const f of packaged) {
    if (!f.axes["wght"] && f.weight[0] !== f.weight[1]) {
      notes.push(`approximated: font-family ${f.family} declares weight ${f.weight.join("–")} but the bundled file has no wght axis; weights other than ${f.weight[0]} are synthesised`);
    }
  }
  const files = packaged.map((f) => f.file).sort();
  return { faces: packaged, plist: plistFragment(files), swift: files.length ? registrationSwift(packaged) : "", notes };
}

// src/fonts/metadata.ts
function metricsForFonts(pkg) {
  return Object.fromEntries(pkg.faces.map((face) => [face.family.toLowerCase(), { ...face.metrics }]));
}
function bundledFamilies(pkg) {
  const out = {};
  for (const f of pkg.faces) {
    if (f.style !== "normal")
      continue;
    const prev = out[f.family];
    out[f.family] = {
      weight: prev ? [Math.min(prev.weight[0], f.weight[0]), Math.max(prev.weight[1], f.weight[1])] : f.weight,
      ...f.axes["opsz"] ? { opsz: f.axes["opsz"] } : prev?.opsz ? { opsz: prev.opsz } : {}
    };
  }
  return out;
}
function unionFaces(docs) {
  const byKey = {};
  for (const doc of docs) {
    for (const f of doc.fonts ?? []) {
      const key = `${f.family}|${f.style}|${f.weight.join("-")}|${f.unicodeRange ?? ""}|${f.src.map((s) => s.file ?? s.url).join(",")}`;
      const prev = byKey[key];
      if (!prev)
        byKey[key] = f;
      else if (f.loaded && !prev.loaded)
        byKey[key] = f;
    }
  }
  return Object.keys(byKey).sort().map((k) => byKey[k]);
}

// src/input/identity.ts
var htmlIdentity = (_tag, attrs, path) => {
  if (attrs.id)
    return `#${attrs.id}`;
  return attrs["data-markswift"] ?? attrs["data-h2s"] ?? attrs["data-testid"] ?? attrs["data-name"] ?? (path === "" ? "root" : path);
};

// src/api/convert.ts
async function convert(source, options = {}) {
  validateName(options.name ?? "ConvertedView");
  const viewport = options.viewport ?? { width: 390, height: 844 };
  const dpr = options.dpr ?? 1;
  if (![viewport.width, viewport.height].every((n) => Number.isInteger(n) && n > 0) || !Number.isFinite(dpr) || dpr <= 0) {
    throw new Error("viewport dimensions must be positive integers and dpr must be positive and finite");
  }
  if (["html", "file", "url"].filter((key) => (key in source)).length !== 1)
    throw new Error("provide exactly one of html, file or url");
  if (options.untrustedInput && (!("html" in source) || source.assetsDir || source.baseURL)) {
    throw new Error("untrustedInput accepts pasted HTML without assetsDir or baseURL only");
  }
  const work = await mkdtemp(join3(tmpdir(), "markswift-"));
  let prepared;
  const renderer = new BrowserCapture({ viewport, dpr, channel: options.browserChannel, restricted: options.untrustedInput });
  try {
    prepared = await resolveSource(source);
    const { html, url, label } = prepared;
    await renderer.start();
    const name = options.name ?? "ConvertedView";
    const theme = options.theme ?? "light";
    const root = options.root ?? DEFAULT_ROOT;
    const capture = await renderer.capture({
      key: `${name}-${theme}`,
      screen: name,
      theme,
      url,
      html,
      root,
      waitFor: options.waitFor,
      inlineImages: true,
      async prepare(page) {
        if (options.css)
          await page.addStyleTag({ content: options.css });
        await options.prepare?.(page);
      }
    }, htmlIdentity, label);
    if (capture.fontFiles.length)
      await mkdir2(join3(work, "_fonts"), { recursive: true });
    for (const font of capture.fontFiles)
      await writeFile2(join3(work, "_fonts", font.name), font.bytes);
    const fontDir = join3(work, "output");
    const fonts = await packageFonts(capture.layout.fonts ?? [], fontDir, work);
    const compiled = compileLayout(capture.layout, {
      name,
      mode: options.mode,
      bundledFamilies: bundledFamilies(fonts),
      fontMetrics: metricsForFonts(fonts)
    });
    const assets = {};
    for (const face of fonts.faces)
      assets[`Fonts/${face.file}`] = new Uint8Array(await readFile3(join3(fontDir, "Fonts", face.file)));
    if (fonts.faces.length) {
      compiled.files["Font+Markswift.swift"] = fonts.swift;
      compiled.files["UIAppFonts.plist.fragment"] = fonts.plist;
    }
    return { ...compiled, assets, warnings: [...capture.warnings, ...fonts.notes], layout: capture.layout };
  } finally {
    try {
      await renderer.stop();
    } finally {
      await prepared?.close();
      await rm2(work, { recursive: true, force: true });
    }
  }
}
function convertHtml(html, options = {}) {
  return convert({ html }, options);
}
// src/api/responsive.ts
import { mkdir as mkdir3, mkdtemp as mkdtemp2, readFile as readFile4, rm as rm3, writeFile as writeFile3 } from "node:fs/promises";
import { tmpdir as tmpdir2 } from "node:os";
import { join as join4 } from "node:path";
async function convertResponsive(source, options) {
  validateResponsiveInput(source, options);
  const work = await mkdtemp2(join4(tmpdir2(), "markswift-responsive-"));
  let prepared;
  try {
    prepared = await resolveSource(source);
    const { html, url, label } = prepared;
    const captureAt = async (branch) => {
      const renderer = new BrowserCapture({
        viewport: options[branch].viewport,
        dpr: options.dpr ?? 1,
        channel: options.browserChannel,
        restricted: options.untrustedInput
      });
      try {
        await renderer.start();
        return await renderer.capture({
          key: `${options.name}-${branch}-${options.theme ?? "light"}`,
          screen: options.name,
          theme: options.theme ?? "light",
          url,
          html,
          root: options.root ?? DEFAULT_ROOT,
          waitFor: options.waitFor,
          inlineImages: true,
          async prepare(page) {
            if (options.css)
              await page.addStyleTag({ content: options.css });
            await options.prepare?.(page);
            const actualViewport = page.viewportSize();
            const expectedViewport = options[branch].viewport;
            if (actualViewport?.width !== expectedViewport.width || actualViewport.height !== expectedViewport.height) {
              throw new Error(`${branch} capture viewport changed during prepare(); expected ` + `${expectedViewport.width}×${expectedViewport.height}, received ` + `${actualViewport?.width ?? "unknown"}×${actualViewport?.height ?? "unknown"}`);
            }
          }
        }, htmlIdentity, label);
      } finally {
        await renderer.stop();
      }
    };
    const compact = await captureAt("compact");
    const regular = await captureAt("regular");
    const fontFiles = new Map;
    for (const font of [...compact.fontFiles, ...regular.fontFiles])
      fontFiles.set(font.name, font.bytes);
    if (fontFiles.size)
      await mkdir3(join4(work, "_fonts"), { recursive: true });
    for (const [name, bytes] of fontFiles)
      await writeFile3(join4(work, "_fonts", name), bytes);
    const fontDir = join4(work, "output");
    const fonts = await packageFonts(unionFaces([compact.layout, regular.layout]), fontDir, work);
    const assets = {};
    for (const face of fonts.faces)
      assets[`Fonts/${face.file}`] = new Uint8Array(await readFile4(join4(fontDir, "Fonts", face.file)));
    const supportFiles = fonts.faces.length ? {
      "Font+Markswift.swift": fonts.swift,
      "UIAppFonts.plist.fragment": fonts.plist
    } : undefined;
    const compiled = compileResponsiveLayouts({
      name: options.name,
      breakpoint: options.breakpoint,
      compact: { layout: compact.layout, viewportWidth: options.compact.viewport.width },
      regular: { layout: regular.layout, viewportWidth: options.regular.viewport.width },
      mode: options.mode,
      bundledFamilies: bundledFamilies(fonts),
      fontMetrics: metricsForFonts(fonts),
      supportFiles,
      assets
    });
    return {
      ...compiled,
      layouts: { compact: compact.layout, regular: regular.layout },
      warnings: aggregateWarnings(compact.warnings, regular.warnings, fonts.notes, options),
      branchWarnings: { compact: compact.warnings, regular: regular.warnings }
    };
  } finally {
    try {
      await prepared?.close();
    } finally {
      await rm3(work, { recursive: true, force: true });
    }
  }
}
function aggregateWarnings(compact, regular, fontNotes, options) {
  const warnings = [...new Set([...compact, ...regular, ...fontNotes])];
  const mediaIndex = warnings.findIndex((message) => message.startsWith("CSS @media conditions "));
  if (mediaIndex >= 0) {
    const rest = warnings.filter((message) => !message.startsWith("CSS @media conditions "));
    rest.splice(mediaIndex, 0, `CSS @media sampled at compact ${options.compact.viewport.width}px and regular ${options.regular.viewport.width}px; ` + `generated Swift switches branches at width ≤ ${options.breakpoint} points. ` + "Intermediate widths and other media states are not reconstructed.");
    return rest;
  }
  return warnings;
}
function validateResponsiveInput(source, options) {
  validateName(options.name);
  const viewportValid = (viewport) => !!viewport && [viewport.width, viewport.height].every((n) => Number.isInteger(n) && n > 0);
  if (!viewportValid(options?.compact?.viewport) || !viewportValid(options?.regular?.viewport)) {
    throw new Error("compact and regular viewport dimensions must be positive integers");
  }
  if (!Number.isSafeInteger(options.breakpoint) || options.breakpoint <= 0 || options.compact.viewport.width > options.breakpoint || options.regular.viewport.width <= options.breakpoint) {
    throw new Error("breakpoint must be a positive integer with compact.width <= breakpoint < regular.width");
  }
  if (options.dpr !== undefined && (!Number.isFinite(options.dpr) || options.dpr <= 0)) {
    throw new Error("dpr must be positive and finite");
  }
  if (["html", "file", "url"].filter((key) => (key in source)).length !== 1) {
    throw new Error("provide exactly one of html, file or url");
  }
  if (options.untrustedInput && (!("html" in source) || source.assetsDir || source.baseURL)) {
    throw new Error("untrustedInput accepts pasted HTML without assetsDir or baseURL only");
  }
}
export {
  HTML_ELEMENTS,
  INPUT_CONTROLS,
  classifyElement,
  compileLayout,
  compileLayouts,
  compileResponsiveLayouts,
  convert,
  convertHtml,
  convertResponsive
};
