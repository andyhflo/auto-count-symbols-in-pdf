let pdfjsLib;
if (typeof window !== "undefined" && window["pdfjs-dist/build/pdf"]) {
  pdfjsLib = window["pdfjs-dist/build/pdf"];
} else {
  pdfjsLib = require("../build/pdf.js");
}
const scale = 4;
var paths = [], svgDivs = [], OverallPageNumber = 0,
  sideBar = document.getElementById('counts'),
  dragbar = document.getElementById('dragbar'),
  table = document.getElementById('table'),
  canvasdiv = document.getElementById('drawings'),
  dropArea = document.getElementById("drop-area");

dragbar.addEventListener("mousedown", (e) => {
  e.preventDefault();
  window.addEventListener("mousemove", resize);
  window.addEventListener("mouseup", mouseup);
  function resize(ex) {
    sideBar.style.width = Math.min(table.offsetWidth,
      Math.max(0, ex.pageX)) + 5 + "px";
  }
  function mouseup() {
    window.removeEventListener("mouseup", mouseup);
    window.removeEventListener("mousemove", resize);
  }
});

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, preventDefaults, false);
  document.body.addEventListener(eventName, preventDefaults, false);
})
dropArea.addEventListener('drop', handleDrop, false);
function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

async function handleDrop(e) {
  console.time('Execution Time');
  files = [...e.dataTransfer.files];
  var filesProcessed = 0;
  for (const file of files) {
    var c = file.type;
    switch (c) {
      case "application/pdf":
        console.log("Received " + file.name + " of type " + c);
        var reader = new FileReader();
        reader.onload = async function (e) {
          var loadingTask = pdfjsLib.getDocument(e.target.result);
          loadingTask.promise.then(function (pdf) {
            var pagesProcessed = 0, totalPages = pdf.numPages;
            for (let pageNumber = 1; pageNumber <= totalPages;
              pageNumber++) {
              pdf.getPage(pageNumber).then(function (page) {
                var viewport = page.getViewport({ scale: scale }),
                  pageDiv = document.createElement('div'),
                  pageBreak = document.createElement('p'),
                  canvas = document.createElement('canvas');;
                pageDiv.setAttribute("class", "page");
                pageDiv.style.height = viewport.height / scale + "px";
                pageDiv.style.width = viewport.width / scale + "px";
                canvasdiv.appendChild(pageDiv);
                pageBreak.setAttribute("style", "page-break-before");
                canvasdiv.appendChild(pageBreak);
                svgDivs[OverallPageNumber] = document.createElement('div');
                svgDivs[OverallPageNumber].setAttribute("class", "svgDiv");
                pageDiv.appendChild(canvas);
                pageDiv.appendChild(svgDivs[OverallPageNumber]);
                var context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                canvas.style.height = viewport.height / scale + "px";
                canvas.style.width = viewport.width / scale + "px";
                var renderContext = {
                  canvasContext: context, viewport: viewport
                },
                  renderTask = page.render(renderContext);
                renderTask.promise.then(async function () {
                  await loadSVG(await outline(this.ctx, this.cvs), this.OPN);
                  pagesProcessed++;
                  if (pagesProcessed === totalPages) {
                    filesProcessed++;
                  }
                  if (filesProcessed === files.length) {
                    sort();
                  }
                }.bind({ OPN: OverallPageNumber, ctx: context, cvs: canvas }));
                OverallPageNumber++;
              }.bind(OverallPageNumber));

            }
          }, function (reason) {      // PDF loading error
            console.error(reason);
          });
        };
        reader.readAsArrayBuffer(file);
        break;
      default:
        console.log(file.name + " of type " + c + " skipped (looking for \
          files with specific extensions only)");
        break;
    }
  }
}

async function outline(ctx, cvs) {
  return new Promise((resolve, reject) => {
    function Point(x, y) {
      this.x = x;
      this.y = y;
    }

    Point.prototype.copy = function () {
      return new Point(this.x, this.y);
    };

    function Bitmap(w, h) {
      this.w = w;
      this.h = h;
      this.size = w * h;
      this.arraybuffer = new ArrayBuffer(this.size);
      this.data = new Int8Array(this.arraybuffer);
    }

    Bitmap.prototype.at = function (x, y) {
      return (x >= 0 && x < this.w && y >= 0 && y < this.h) &&
        this.data[this.w * y + x] === 1;
    };

    Bitmap.prototype.index = function (i) {
      var point = new Point();
      point.y = Math.floor(i / this.w);
      point.x = i - point.y * this.w;
      return point;
    };

    Bitmap.prototype.flip = function (x, y) {
      if (this.at(x, y)) {
        this.data[this.w * y + x] = 0;
      } else {
        this.data[this.w * y + x] = 1;
      }
    };

    Bitmap.prototype.copy = function () {
      var bm = new Bitmap(this.w, this.h), i;
      for (i = 0; i < this.size; i++) {
        bm.data[i] = this.data[i];
      }
      return bm;
    };

    function Path() {
      this.area = 0;
      this.len = 0;
      this.curve = {};
      this.pt = [];
      this.minX = 100000;
      this.minY = 100000;
      this.maxX = -1;
      this.maxY = -1;
    }

    function Curve(n) {
      this.n = n;
      this.tag = new Array(n);
      this.c = new Array(n * 3);
      this.alphaCurve = 0;
      this.vertex = new Array(n);
      this.alpha = new Array(n);
      this.alpha0 = new Array(n);
      this.beta = new Array(n);
    }

    var bm = null,
      pathlist = [],
      callback,
      info = {
        isReady: false,
        turnpolicy: "minority",
        turdsize: 2
      };

    function bmToPathlist() {
      var bm1 = bm.copy(),
        currentPoint = new Point(0, 0),
        path;

      function findNext(point) {
        var i = bm1.w * point.y + point.x;
        while (i < bm1.size && bm1.data[i] !== 1) {
          i++;
        }
        return i < bm1.size && bm1.index(i);
      }

      function majority(x, y) {
        var i, a, ct;
        for (i = 2; i < 5; i++) {
          ct = 0;
          for (a = -i + 1; a <= i - 1; a++) {
            ct += bm1.at(x + a, y + i - 1) ? 1 : -1;
            ct += bm1.at(x + i - 1, y + a - 1) ? 1 : -1;
            ct += bm1.at(x + a - 1, y - i) ? 1 : -1;
            ct += bm1.at(x - i, y + a) ? 1 : -1;
          }
          if (ct > 0) {
            return 1;
          } else if (ct < 0) {
            return 0;
          }
        }
        return 0;
      }

      function findPath(point) {
        var path = new Path(),
          x = point.x, y = point.y,
          dirx = 0, diry = 1, tmp;
        path.sign = bm.at(point.x, point.y) ? "+" : "-";

        while (1) {
          path.pt.push(new Point(x, y));
          if (x > path.maxX) path.maxX = x;
          if (x < path.minX) path.minX = x;
          if (y > path.maxY) path.maxY = y;
          if (y < path.minY) path.minY = y;
          path.len++;
          x += dirx;
          y += diry;
          path.area -= x * diry;
          if (x === point.x && y === point.y) break;
          var l = bm1.at(x + (dirx + diry - 1) / 2, y + (diry - dirx - 1) / 2);
          var r = bm1.at(x + (dirx - diry - 1) / 2, y + (diry + dirx - 1) / 2);
          if (r && !l) {
            if (info.turnpolicy === "right" ||
              (info.turnpolicy === "black" && path.sign === '+') ||
              (info.turnpolicy === "white" && path.sign === '-') ||
              (info.turnpolicy === "majority" && majority(x, y)) ||
              (info.turnpolicy === "minority" && !majority(x, y))) {
              tmp = dirx;
              dirx = -diry;
              diry = tmp;
            } else {
              tmp = dirx;
              dirx = diry;
              diry = -tmp;
            }
          } else if (r) {
            tmp = dirx;
            dirx = -diry;
            diry = tmp;
          } else if (!l) {
            tmp = dirx;
            dirx = diry;
            diry = -tmp;
          }
        }
        return path;
      }

      function xorPath(path) {
        var y1 = path.pt[0].y,
          len = path.len,
          x, y, maxX, minY, i, j;
        for (i = 1; i < len; i++) {
          x = path.pt[i].x;
          y = path.pt[i].y;
          if (y !== y1) {
            minY = y1 < y ? y1 : y;
            maxX = path.maxX;
            for (j = x; j < maxX; j++) {
              bm1.flip(j, minY);
            }
            y1 = y;
          }
        }
      }

      while (currentPoint = findNext(currentPoint)) {
        path = findPath(currentPoint);
        xorPath(path);
        if (path.area > info.turdsize) {
          pathlist.push(path);
        }
      }
    }

    function processPath() {
      function Quad() {
        this.data = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      }

      Quad.prototype.at = function (x, y) {
        return this.data[x * 3 + y];
      };

      function Sum(x, y, xy, x2, y2) {
        this.x = x;
        this.y = y;
        this.xy = xy;
        this.x2 = x2;
        this.y2 = y2;
      }

      function mod(a, n) {
        return a >= n ? a % n : a >= 0 ? a : n - 1 - (-1 - a) % n;
      }

      function xprod(p1, p2) {
        return p1.x * p2.y - p1.y * p2.x;
      }

      function cyclic(a, b, c) {
        if (a <= c) {
          return (a <= b && b < c);
        } else {
          return (a <= b || b < c);
        }
      }

      function sign(i) {
        return i > 0 ? 1 : i < 0 ? -1 : 0;
      }

      function quadform(Q, w) {
        var v = new Array(3), i, j, sum;
        v[0] = w.x;
        v[1] = w.y;
        v[2] = 1;
        sum = 0.0;

        for (i = 0; i < 3; i++) {
          for (j = 0; j < 3; j++) {
            sum += v[i] * Q.at(i, j) * v[j];
          }
        }
        return sum;
      }

      function interval(lambda, a, b) {
        var res = new Point();
        res.x = a.x + lambda * (b.x - a.x);
        res.y = a.y + lambda * (b.y - a.y);
        return res;
      }

      function dorth_infty(p0, p2) {
        var r = new Point();
        r.y = sign(p2.x - p0.x);
        r.x = -sign(p2.y - p0.y);

        return r;
      }

      function ddenom(p0, p2) {
        var r = dorth_infty(p0, p2);
        return r.y * (p2.x - p0.x) - r.x * (p2.y - p0.y);
      }

      function dpara(p0, p1, p2) {      //x1 * y2 - x2 * y1
        return (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
      }

      function cprod(p0, p1, p2, p3) {      //x1 * y2 - x2 * y1
        return (p1.x - p0.x) * (p3.y - p2.y) - (p3.x - p2.x) * (p1.y - p0.y);
      }

      function iprod(p0, p1, p2) {      //x1 * x2 + y1 * y2
        return (p1.x - p0.x) * (p2.x - p0.x) + (p1.y - p0.y) * (p2.y - p0.y);
      }

      function iprod1(p0, p1, p2, p3) {      //x1 * x2 + y1 * y2
        return (p1.x - p0.x) * (p3.x - p2.x) + (p1.y - p0.y) * (p3.y - p2.y);
      }

      function ddist(p, q) {
        return Math.sqrt((p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y));
      }

      function tangent(p0, p1, p2, p3, q0, q1) {
        var A, B, C, a, b, c, d, s, r1, r2;

        A = cprod(p0, p1, q0, q1);
        B = cprod(p1, p2, q0, q1);
        C = cprod(p2, p3, q0, q1);

        a = A - 2 * B + C;
        b = -2 * A + 2 * B;
        c = A;

        d = b * b - 4 * a * c;

        if (a === 0 || d < 0) {
          return -1.0;
        }

        s = Math.sqrt(d);

        r1 = (-b + s) / (2 * a);
        r2 = (-b - s) / (2 * a);

        if (r1 >= 0 && r1 <= 1) {
          return r1;
        } else if (r2 >= 0 && r2 <= 1) {
          return r2;
        } else {
          return -1.0;
        }
      }

      function calcSums(path) {
        var i, x, y;
        path.x0 = path.pt[0].x;
        path.y0 = path.pt[0].y;
        path.sums = [];
        var s = path.sums;
        s.push(new Sum(0, 0, 0, 0, 0));
        for (i = 0; i < path.len; i++) {
          x = path.pt[i].x - path.x0;
          y = path.pt[i].y - path.y0;
          s.push(new Sum(s[i].x + x, s[i].y + y, s[i].xy + x * y,
            s[i].x2 + x * x, s[i].y2 + y * y));
        }
      }

      function calcLon(path) {
        var n = path.len, pt = path.pt, dir,
          pivk = new Array(n),
          nc = new Array(n),
          ct = new Array(4);
        path.lon = new Array(n);

        var constraint = [new Point(), new Point()],
          cur = new Point(),
          off = new Point(),
          dk = new Point(),
          foundk;

        var i, j, k1, a, b, c, d, k = 0;
        for (i = n - 1; i >= 0; i--) {
          if (pt[i].x != pt[k].x && pt[i].y != pt[k].y) {
            k = i + 1;
          }
          nc[i] = k;
        }

        for (i = n - 1; i >= 0; i--) {
          ct[0] = ct[1] = ct[2] = ct[3] = 0;
          dir = (3 + 3 * (pt[mod(i + 1, n)].x - pt[i].x) +
            (pt[mod(i + 1, n)].y - pt[i].y)) / 2;
          ct[dir]++;

          constraint[0].x = 0;
          constraint[0].y = 0;
          constraint[1].x = 0;
          constraint[1].y = 0;

          k = nc[i];
          k1 = i;
          while (1) {
            foundk = 0;
            dir = (3 + 3 * sign(pt[k].x - pt[k1].x) +
              sign(pt[k].y - pt[k1].y)) / 2;
            ct[dir]++;

            if (ct[0] && ct[1] && ct[2] && ct[3]) {
              pivk[i] = k1;
              foundk = 1;
              break;
            }

            cur.x = pt[k].x - pt[i].x;
            cur.y = pt[k].y - pt[i].y;

            if (xprod(constraint[0], cur) < 0 || xprod(constraint[1], cur) > 0) {
              break;
            }

            if (Math.abs(cur.x) <= 1 && Math.abs(cur.y) <= 1) {

            } else {
              off.x = cur.x + ((cur.y >= 0 && (cur.y > 0 || cur.x < 0)) ? 1 : -1);
              off.y = cur.y + ((cur.x <= 0 && (cur.x < 0 || cur.y < 0)) ? 1 : -1);
              if (xprod(constraint[0], off) >= 0) {
                constraint[0].x = off.x;
                constraint[0].y = off.y;
              }
              off.x = cur.x + ((cur.y <= 0 && (cur.y < 0 || cur.x < 0)) ? 1 : -1);
              off.y = cur.y + ((cur.x >= 0 && (cur.x > 0 || cur.y < 0)) ? 1 : -1);
              if (xprod(constraint[1], off) <= 0) {
                constraint[1].x = off.x;
                constraint[1].y = off.y;
              }
            }
            k1 = k;
            k = nc[k1];
            if (!cyclic(k, i, k1)) {
              break;
            }
          }
          if (foundk === 0) {
            dk.x = sign(pt[k].x - pt[k1].x);
            dk.y = sign(pt[k].y - pt[k1].y);
            cur.x = pt[k1].x - pt[i].x;
            cur.y = pt[k1].y - pt[i].y;
            a = xprod(constraint[0], cur);
            b = xprod(constraint[0], dk);
            c = xprod(constraint[1], cur);
            d = xprod(constraint[1], dk);

            j = 10000000;
            if (b < 0) {
              j = Math.floor(a / -b);
            }
            if (d > 0) {
              j = Math.min(j, Math.floor(-c / d));
            }
            pivk[i] = mod(k1 + j, n);
          }
        }
        j = pivk[n - 1];
        path.lon[n - 1] = j;
        for (i = n - 2; i >= 0; i--) {
          if (cyclic(i + 1, pivk[i], j)) {
            j = pivk[i];
          }
          path.lon[i] = j;
        }
        for (i = n - 1; cyclic(mod(i + 1, n), j, path.lon[i]); i--) {
          path.lon[i] = j;
        }
      }

      function bestPolygon(path) {
        function penalty3(path, i, j) {
          var n = path.len, pt = path.pt, sums = path.sums;
          var x, y, xy, x2, y2,
            k, a, b, c, s,
            px, py, ex, ey,
            r = 0;
          if (j >= n) {
            j -= n;
            r = 1;
          }

          if (r === 0) {
            x = sums[j + 1].x - sums[i].x;
            y = sums[j + 1].y - sums[i].y;
            x2 = sums[j + 1].x2 - sums[i].x2;
            xy = sums[j + 1].xy - sums[i].xy;
            y2 = sums[j + 1].y2 - sums[i].y2;
            k = j + 1 - i;
          } else {
            x = sums[j + 1].x - sums[i].x + sums[n].x;
            y = sums[j + 1].y - sums[i].y + sums[n].y;
            x2 = sums[j + 1].x2 - sums[i].x2 + sums[n].x2;
            xy = sums[j + 1].xy - sums[i].xy + sums[n].xy;
            y2 = sums[j + 1].y2 - sums[i].y2 + sums[n].y2;
            k = j + 1 - i + n;
          }

          px = (pt[i].x + pt[j].x) / 2.0 - pt[0].x;
          py = (pt[i].y + pt[j].y) / 2.0 - pt[0].y;
          ey = (pt[j].x - pt[i].x);
          ex = -(pt[j].y - pt[i].y);
          a = ((x2 - 2 * x * px) / k + px * px);
          b = ((xy - x * py - y * px) / k + px * py);
          c = ((y2 - 2 * y * py) / k + py * py);
          s = ex * ex * a + 2 * ex * ey * b + ey * ey * c;
          return Math.sqrt(s);
        }

        var i, j, m, k,
          n = path.len,
          pen = new Array(n + 1),
          prev = new Array(n + 1),
          clip0 = new Array(n),
          clip1 = new Array(n + 1),
          seg0 = new Array(n + 1),
          seg1 = new Array(n + 1),
          thispen, best, c;

        for (i = 0; i < n; i++) {
          c = mod(path.lon[mod(i - 1, n)] - 1, n);
          if (c == i) {
            c = mod(i + 1, n);
          }
          if (c < i) {
            clip0[i] = n;
          } else {
            clip0[i] = c;
          }
        }

        j = 1;
        for (i = 0; i < n; i++) {
          while (j <= clip0[i]) {
            clip1[j] = i;
            j++;
          }
        }

        i = 0;
        for (j = 0; i < n; j++) {
          seg0[j] = i;
          i = clip0[i];
        }
        seg0[j] = n;
        m = j;
        i = n;
        for (j = m; j > 0; j--) {
          seg1[j] = i;
          i = clip1[i];
        }
        seg1[0] = 0;
        pen[0] = 0;
        for (j = 1; j <= m; j++) {
          for (i = seg1[j]; i <= seg0[j]; i++) {
            best = -1;
            for (k = seg0[j - 1]; k >= clip1[i]; k--) {
              thispen = penalty3(path, k, i) + pen[k];
              if (best < 0 || thispen < best) {
                prev[i] = k;
                best = thispen;
              }
            }
            pen[i] = best;
          }
        }
        path.m = m;
        path.po = new Array(m);
        for (i = n, j = m - 1; i > 0; j--) {
          i = prev[i];
          path.po[j] = i;
        }
      }

      function adjustVertices(path) {
        function pointslope(path, i, j, ctr, dir) {
          var n = path.len, sums = path.sums,
            x, y, x2, xy, y2,
            k, a, b, c, lambda2, l, r = 0;

          while (j >= n) {
            j -= n;
            r += 1;
          }
          while (i >= n) {
            i -= n;
            r -= 1;
          }
          while (j < 0) {
            j += n;
            r -= 1;
          }
          while (i < 0) {
            i += n;
            r += 1;
          }

          x = sums[j + 1].x - sums[i].x + r * sums[n].x;
          y = sums[j + 1].y - sums[i].y + r * sums[n].y;
          x2 = sums[j + 1].x2 - sums[i].x2 + r * sums[n].x2;
          xy = sums[j + 1].xy - sums[i].xy + r * sums[n].xy;
          y2 = sums[j + 1].y2 - sums[i].y2 + r * sums[n].y2;
          k = j + 1 - i + r * n;
          ctr.x = x / k;
          ctr.y = y / k;
          a = (x2 - x * x / k) / k;
          b = (xy - x * y / k) / k;
          c = (y2 - y * y / k) / k;
          lambda2 = (a + c + Math.sqrt((a - c) * (a - c) + 4 * b * b)) / 2;
          a -= lambda2;
          c -= lambda2;

          if (Math.abs(a) >= Math.abs(c)) {
            l = Math.sqrt(a * a + b * b);
            if (l !== 0) {
              dir.x = -b / l;
              dir.y = a / l;
            }
          } else {
            l = Math.sqrt(c * c + b * b);
            if (l !== 0) {
              dir.x = -c / l;
              dir.y = b / l;
            }
          }
          if (l === 0) {
            dir.x = dir.y = 0;
          }
        }

        var m = path.m, po = path.po, n = path.len, pt = path.pt,
          x0 = path.x0, y0 = path.y0,
          ctr = new Array(m), dir = new Array(m),
          q = new Array(m),
          v = new Array(3), d, i, j, k, l,
          s = new Point();

        path.curve = new Curve(m);

        for (i = 0; i < m; i++) {
          j = po[mod(i + 1, m)];
          j = mod(j - po[i], n) + po[i];
          ctr[i] = new Point();
          dir[i] = new Point();
          pointslope(path, po[i], j, ctr[i], dir[i]);
        }

        for (i = 0; i < m; i++) {
          q[i] = new Quad();
          d = dir[i].x * dir[i].x + dir[i].y * dir[i].y;
          if (d === 0.0) {
            for (j = 0; j < 3; j++) {
              for (k = 0; k < 3; k++) {
                q[i].data[j * 3 + k] = 0;
              }
            }
          } else {
            v[0] = dir[i].y;
            v[1] = -dir[i].x;
            v[2] = - v[1] * ctr[i].y - v[0] * ctr[i].x;
            for (l = 0; l < 3; l++) {
              for (k = 0; k < 3; k++) {
                q[i].data[l * 3 + k] = v[l] * v[k] / d;
              }
            }
          }
        }

        var Q, w, dx, dy, det, min, cand, xmin, ymin, z;
        for (i = 0; i < m; i++) {
          Q = new Quad();
          w = new Point();

          s.x = pt[po[i]].x - x0;
          s.y = pt[po[i]].y - y0;

          j = mod(i - 1, m);

          for (l = 0; l < 3; l++) {
            for (k = 0; k < 3; k++) {
              Q.data[l * 3 + k] = q[j].at(l, k) + q[i].at(l, k);
            }
          }

          while (1) {
            det = Q.at(0, 0) * Q.at(1, 1) - Q.at(0, 1) * Q.at(1, 0);
            if (det !== 0.0) {
              w.x = (-Q.at(0, 2) * Q.at(1, 1) + Q.at(1, 2) * Q.at(0, 1)) / det;
              w.y = (Q.at(0, 2) * Q.at(1, 0) - Q.at(1, 2) * Q.at(0, 0)) / det;
              break;
            }

            if (Q.at(0, 0) > Q.at(1, 1)) {
              v[0] = -Q.at(0, 1);
              v[1] = Q.at(0, 0);
            } else if (Q.at(1, 1)) {
              v[0] = -Q.at(1, 1);
              v[1] = Q.at(1, 0);
            } else {
              v[0] = 1;
              v[1] = 0;
            }
            d = v[0] * v[0] + v[1] * v[1];
            v[2] = - v[1] * s.y - v[0] * s.x;
            for (l = 0; l < 3; l++) {
              for (k = 0; k < 3; k++) {
                Q.data[l * 3 + k] += v[l] * v[k] / d;
              }
            }
          }
          dx = Math.abs(w.x - s.x);
          dy = Math.abs(w.y - s.y);
          if (dx <= 0.5 && dy <= 0.5) {
            path.curve.vertex[i] = new Point(w.x + x0, w.y + y0);
            continue;
          }

          min = quadform(Q, s);
          xmin = s.x;
          ymin = s.y;

          if (Q.at(0, 0) !== 0.0) {
            for (z = 0; z < 2; z++) {
              w.y = s.y - 0.5 + z;
              w.x = - (Q.at(0, 1) * w.y + Q.at(0, 2)) / Q.at(0, 0);
              dx = Math.abs(w.x - s.x);
              cand = quadform(Q, w);
              if (dx <= 0.5 && cand < min) {
                min = cand;
                xmin = w.x;
                ymin = w.y;
              }
            }
          }

          if (Q.at(1, 1) !== 0.0) {
            for (z = 0; z < 2; z++) {
              w.x = s.x - 0.5 + z;
              w.y = - (Q.at(1, 0) * w.x + Q.at(1, 2)) / Q.at(1, 1);
              dy = Math.abs(w.y - s.y);
              cand = quadform(Q, w);
              if (dy <= 0.5 && cand < min) {
                min = cand;
                xmin = w.x;
                ymin = w.y;
              }
            }
          }

          for (l = 0; l < 2; l++) {
            for (k = 0; k < 2; k++) {
              w.x = s.x - 0.5 + l;
              w.y = s.y - 0.5 + k;
              cand = quadform(Q, w);
              if (cand < min) {
                min = cand;
                xmin = w.x;
                ymin = w.y;
              }
            }
          }
          path.curve.vertex[i] = new Point(xmin + x0, ymin + y0);
        }
      }
      function reverse(path) {
        var curve = path.curve, m = curve.n, v = curve.vertex, i, j, tmp;
        for (i = 0, j = m - 1; i < j; i++, j--) {
          tmp = v[i];
          v[i] = v[j];
          v[j] = tmp;
        }
      }
      function smooth(path) {
        var m = path.curve.n, curve = path.curve;
        var i, j, k, dd, denom, alpha,
          p2, p3, p4;
        for (i = 0; i < m; i++) {
          j = mod(i + 1, m);
          k = mod(i + 2, m);
          p4 = interval(1 / 2.0, curve.vertex[k], curve.vertex[j]);
          denom = ddenom(curve.vertex[i], curve.vertex[k]);
          if (denom !== 0.0) {
            dd = dpara(curve.vertex[i], curve.vertex[j], curve.vertex[k]) / denom;
            dd = Math.abs(dd);
            alpha = dd > 1 ? (1 - 1.0 / dd) : 0;
            alpha = alpha / 0.75;
          } else {
            alpha = 4 / 3.0;
          }
          curve.alpha0[j] = alpha;
          curve.tag[j] = "CORNER";
          curve.c[3 * j + 1] = curve.vertex[j];
          curve.c[3 * j + 2] = p4;
          curve.alpha[j] = alpha;
          curve.beta[j] = 0.5;
        }
        curve.alphacurve = 1;
      }

      for (var i = 0; i < pathlist.length; i++) {
        var path = pathlist[i];
        calcSums(path);
        calcLon(path);
        bestPolygon(path);
        adjustVertices(path);
        if (path.sign === "-") {
          reverse(path);
        }
        smooth(path);
      }
    }

    function getSVG(size) {
      function path(curve) {
        function segment(i) {
          var s = (curve.c[i * 3 + 1].x * size).toFixed(3) + ' ' +
            (curve.c[i * 3 + 1].y * size).toFixed(3) + ' ';
          return s;
        }

        var n = curve.n, i,
          p = 'M ' + (curve.c[(n - 1) * 3 + 1].x * size).toFixed(3) +
            ' ' + (curve.c[(n - 1) * 3 + 1].y * size).toFixed(3) + ' ';
        for (i = 0; i < n; i++) {
          p += segment(i);
        }
        return p;
      }

      var w = bm.w * size, h = bm.h * size,
        len = pathlist.length, c, i;

      var svg = '<svg version="1.1" width="' + w + '" height="' + h +
        '" xmlns="http://www.w3.org/2000/svg">';
      svg += '<path d="';
      for (i = 0; i < len; i++) {
        svg += path(pathlist[i].curve);
      }
      svg += '" stroke="black" fill="white"/></svg>';
      return svg;
    }

    bm = new Bitmap(cvs.width, cvs.height);
    var imgdataobj = ctx.getImageData(0, 0, bm.w, bm.h),
      l = imgdataobj.data.length, i, j, color;
    for (i = 0, j = 0; i < l; i += 4, j++) {
      color = 0.2126 * imgdataobj.data[i] + 0.7153 * imgdataobj.data[i + 1] +
        0.0721 * imgdataobj.data[i + 2];
      bm.data[j] = (color < 128 ? 1 : 0);
    }
    bmToPathlist();
    processPath();
    resolve(getSVG(1 / scale));
  });
}

async function loadSVG(c, OverallPageNum) {
  return new Promise((resolve, reject) => {
    var head = c.indexOf('d="') + 5,
      tail = c.indexOf('"', head) - head;
    if (tail < 8) return resolve();
    var minX, maxX, minY, maxY, midX, midY, n, isX, path = [], newPath, rotate,
      p = c.substr(head, tail).split("M");
    for (var i = 0; i < p.length; i++) {
      var m = p[i].split(/[\sL,]+/).filter(function (el) {
        return el != '';
      });
      minX = Infinity;
      minY = Infinity;
      maxX = 0;
      maxY = 0;
      allX = 0;
      allY = 0;
      pointsInPath = 0;
      isX = true;
      for (var j = 0; j < m.length; j++) {
        n = Math.round(parseFloat(m[j]) * 1000) / 1000;
        if (isX) {
          minX = Math.min(minX, n);
          maxX = Math.max(maxX, n);
          allX += n;
        }
        else {
          minY = Math.min(minY, n);
          maxY = Math.max(maxY, n);
          allY += n;
          pointsInPath++;
        }
        isX = !isX;
      }
      midX = Math.round((minX + maxX) / 2 * 1000) / 1000;
      midY = Math.round((minY + maxY) / 2 * 1000) / 1000;
      newPath = "M ";
      if (Math.abs((allY / pointsInPath - midY) / (allX / pointsInPath - midX))
        > 1) {      //rotate 0 degrees
        if ((allY / pointsInPath - midY) > 0) {
          for (var k = 0; k < m.length; k++) {
            if (isX) {
              n = Math.round((parseFloat(m[k]) - midX) * 1000) / 1000;
              newPath += n + " ";
            }
            else {
              n = Math.round((parseFloat(m[k]) - midY) * 1000) / 1000;
              newPath += n + " ";
            }
            isX = !isX;
          }
          rotate = 0
        }
        else {      //rotate 180 degrees
          for (var k = 0; k < m.length; k++) {
            if (isX) {
              n = -Math.round((parseFloat(m[k]) - midX) * 1000) / 1000;
              newPath += n + " ";
            }
            else {
              n = -Math.round((parseFloat(m[k]) - midY) * 1000) / 1000;
              newPath += n + " ";
            }
            isX = !isX;
          }
          rotate = 180
        }
      } else {
        if ((allX / pointsInPath - midX) > 0) {      //rotate 90 degrees
          for (var k = 0; k < m.length; k++) {
            if (isX) {
              n = Math.round((parseFloat(m[k + 1]) - midY) * 1000) / 1000;
              newPath += n + " ";
            }
            else {
              n = - Math.round((parseFloat(m[k - 1]) - midX) * 1000) / 1000;
              newPath += n + " ";
            }
            isX = !isX;
          }
          rotate = 90
        }
        else {      //rotate -90 degrees
          for (var k = 0; k < m.length; k++) {
            if (isX) {
              n = - Math.round((parseFloat(m[k + 1]) - midY) * 1000) / 1000;
              newPath += n + " ";
            }
            else {
              n = Math.round((parseFloat(m[k - 1]) - midX) * 1000) / 1000;
              newPath += n + " ";
            }
            isX = !isX;
          }
          rotate = -90
        }
      }
      path = [Math.round(Math.pow(Math.pow((maxX - minX), 2) +
        Math.pow((maxY - minY), 2), .5) * 10000) / 10000, //size
        newPath,
        rotate,
      Math.round((maxX - minX) * 1000) / 1000, //width
      Math.round((maxY - minY) * 1000) / 1000, //height
        midX,
        midY,
        OverallPageNum,
      paths.length]
      paths.push(path);
    }
    resolve();
  })
}

function sort(head) {
  while (table.firstChild) {
    table.removeChild(table.firstChild);
  }
  table.insertAdjacentHTML('beforeend', '<div class="row">\
    <div class="col"></div><div class="col">Description</div>\
    <div class="col">Symbol</div><div class="col">Qty</div></div>');
  var threshold = 0;
  paths.sort(function (a, b) {
    if (a[0] < b[0]) return 1;
    if (a[0] > b[0]) return -1;
    if (a[1] < b[1]) return 1;
    if (a[1] > b[1]) return -1;
    return 0;
  });
  var newSVG = [], refs = [];
  for (let p = 0; p < OverallPageNumber; p++) {
    newSVG[p] = '<svg version="1.1" width="' +
      parseInt(svgDivs[p].parentNode.style.width) + '" height="' +
      parseInt(svgDivs[p].parentNode.style.height) +
      '" xmlns="http://www.w3.org/2000/svg">';
    refs[p] = '';
  }
  refs[paths[0][7]] = '<use href="#' + paths[0][8] + '" x="' + paths[0][5] +
    '" y="' + paths[0][6] + '" transform="rotate(' + paths[0][2] + ',' +
    paths[0][5] + ',' + paths[0][6] + ')"/>';
  var quantity = 1, differences, size, list = "",
    lookBack = paths[0][1].split(/[\s,]+/);
  for (var l = 1; l < paths.length; l++) {
    var next = paths[l][1].split(/[\s,]+/);
    differences = threshold + 1;
    if (lookBack.length == next.length) {
      differences = 0;
      for (var m = 1; m < next.length - 1; m++) {
        if (lookBack[m] !== next[m]) {
          if (isNaN(lookBack[m]) || isNaN(next[m])) {
            differences += threshold + 1;
            break
          }
          differences += Math.pow(lookBack[m] - next[m], 2);
        }
        if (differences > threshold) break;
      }
    }
    if (differences > threshold) {
      size = Math.ceil(Math.max(paths[l - 1][3], paths[l - 1][4])) + 2;
      table.insertAdjacentHTML('beforeend', '<div class="row">\
        <div class="col"></div><div class="col"><input type="text" maxlength="15"\
        size="15" name="description" pattern=[A-Za-z][A-Za-z\d]{4,29} \
        title="Description" placeholder="' + list + paths[l - 1][8] + '"></div>\
        <div class="col"><svg xmlns="http://www.w3.org/2000/svg" width="15" \
        height="15" viewBox="' + -size / 2 + ' ' + -size / 2 + ' ' + size + ' ' +
        size + '"  version="1.1"><path id="' + paths[l - quantity][8] + '" d="' +
        lookBack.toString().replace(/[,]/g, " ") + '"/></svg></div>\
        <div class="col">' + quantity + '</div></div>');
      lookBack = next;
      list = "";
      quantity = 1;
    } else {
      quantity++;
      list += paths[l - 1][8] + ", ";
    }
    refs[paths[l][7]] += '<use href="#' + paths[l + 1 - quantity][8] + '" x="' +
      paths[l][5] + '" y="' + paths[l][6] + '" transform="rotate(' +
      paths[l][2] + ',' + paths[l][5] + ',' + paths[l][6] + ')"/>';
  }
  size = Math.ceil(Math.max(paths[paths.length - 1][3],
    paths[paths.length - 1][4])) + 2;
  table.insertAdjacentHTML('beforeend', '<div class="row">\
    <div class="col"></div><div class="col"><input type="text" maxlength="15" \
    size="15" name="description" pattern=[A-Za-z][A-Za-z\d]{4,29} \
    title="Description" placeholder="' + paths[paths.length - 1][8] + '"></div>\
    <div class="col"><svg xmlns="http://www.w3.org/2000/svg" width="15" \
    height="15" viewBox="' + -size / 2 + ' ' + -size / 2 + ' ' + size + ' ' +
    size + '"  version="1.1"><path id="' + paths[paths.length - quantity][8] +
    '" d="' + lookBack.toString().replace(/[,]/g, " ") + '"/></svg></div>\
    <div class="col">' + quantity + '</div></div>');
  sideBar.style.width = (table.offsetWidth + 5) + "px";
  for (let p = 0; p < OverallPageNumber; p++) {
    while (svgDivs[p].firstChild) {
      svgDivs[p].removeChild(svgDivs[p].firstChild);
    }
    svgDivs[p].insertAdjacentHTML('beforeend', newSVG[p] + refs[p] + '</svg>');
  }
  console.timeEnd('Execution Time');
}