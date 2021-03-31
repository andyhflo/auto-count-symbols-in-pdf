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
});
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
                  await outline(this.ctx, this.cvs, this.OPN);
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

async function outline(ctx, cvs, OverallPageNum) {
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
      this.pt = [];
      this.po = [[], [], [], []];
      this.minX = Infinity;
      this.minY = Infinity;
      this.maxX = -1;
      this.maxY = -1;
      this.firstMinX = -1;
      this.firstMinY = -1;
      this.firstMaxX = -1;
      this.firstMaxY = -1;
    }

    var bm = null,
      pathlist = [],
      info = {
        turnpolicy: "minority",
        turdsize: 2
      };

    bm = new Bitmap(cvs.width, cvs.height);
    var imgdataobj = ctx.getImageData(0, 0, bm.w, bm.h),
      l = imgdataobj.data.length, i, j, color;
    for (i = 0, j = 0; i < l; i += 4, j++) {
      color = 0.2126 * imgdataobj.data[i] + 0.7153 * imgdataobj.data[i + 1] +
        0.0721 * imgdataobj.data[i + 2];
      bm.data[j] = (color < 128 ? 1 : 0);
    }
    // bmToPathlist
    var bm1 = bm.copy(),
      currentPoint = new Point(0, 0), path;

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
        if (x > path.maxX) {
          path.maxX = x;
          path.firstMaxX = path.len;
        }
        if (x < path.minX) {
          path.minX = x;
          path.firstMinX = path.len;
        }
        if (y > path.maxY) {
          path.maxY = y;
          path.firstMaxY = path.len;
        }
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
      for (var fmy = path.firstMaxX; fmy < path.len; fmy++) {
        if (path.pt[fmy].y == path.minY) {
          path.firstMinY = fmy;
          break;
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
        if (path.sign === "-") {
          var irev, jrev, rev;
          for (irev = 0, jrev = path.len - 1; irev < jrev; irev++, jrev--) {
            rev = path.pt[irev];
            path.pt[irev] = path.pt[jrev];
            path.pt[jrev] = rev;
          }
          path.firstMaxX = path.len - path.firstMaxX - 1;
          path.firstMaxY = path.len - path.firstMaxY - 1;
          path.firstMinX = path.len - path.firstMinX - 1;
          path.firstMinY = path.len - path.firstMinY - 1;
        }
        pathlist.push(path);
      }
    }
    // processPath
    function Sum(x, y) {
      this.x = x;
      this.y = y;
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

    function calcSums(path) {
      var i, x, y;
      path.x0 = path.pt[0].x;
      path.y0 = path.pt[0].y;
      path.sums = [];
      var s = path.sums;
      s.push(new Sum(0, 0));
      for (i = 0; i < path.len; i++) {
        x = path.pt[i].x - path.x0;
        y = path.pt[i].y - path.y0;
        s.push(new Sum(s[i].x + x, s[i].y + y));
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

          if (ct[0] && ct[1] && ct[2] || ct[0] && ct[1] && ct[3]
            || ct[0] && ct[2] && ct[3] || ct[1] && ct[2] && ct[3]) {
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

          j = Infinity;
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
      var i, j0, j1, j2, j3, n = path.len, startOver = false;
      if (path.sign === "-") {
        startOver = false;
        path.po[0][0] = path.firstMinX;
        i = path.lon.indexOf(path.lon[path.firstMinX]) - 1;
        if (i == -1) {
          if (path.lon[0] == path.lon[n - 1]) {
            i = path.lon.indexOf(path.lon[path.firstMinX], path.firstMaxX) - 1;
          } else i = n - 1;
        }
        if (!(path.lon[i] > path.po[0][0])) {
          if (path.lon[(i + 1) % path.len] < path.po[0][0]) {
            startOver = true;
          } else i = (i + 1) % path.len;
        }
        if (path.lon[i] > path.firstMinX || path.lon[i] < path.firstMinY) {
          for (j0 = 1; j0 < n; j0++) {
            path.po[0][j0] = path.lon[i];
            i = path.lon.indexOf(path.lon[path.po[0][j0]]) - 1;
            if (i == -1) {
              if (path.lon[0] == path.lon[n - 1]) {
                i = path.lon.indexOf(path.lon[path.po[0][j0]],
                  path.firstMaxX) - 1;
              } else i = n - 1;
            }
            if (!(path.lon[i] > path.po[0][j0])) {
              if (path.lon[(i + 1) % path.len] < path.po[0][j0]) {
                startOver = true;
              } else i = (i + 1) % path.len;
            }
            if (startOver != false && path.lon[i] >= path.firstMinY) break;
          }
        }

        path.po[1][0] = path.firstMinY;
        i = path.lon.indexOf(path.lon[path.firstMinY]) - 1;
        if (i == -1) {
          if (path.lon[0] == path.lon[n - 1]) {
            i = path.lon.indexOf(path.lon[path.firstMinY], path.firstMinY) - 1;
          } else i = n - 1;
        }
        if (path.lon[i] < path.firstMaxX) {
          for (j1 = 1; j1 < n; j1++) {
            path.po[1][j1] = path.lon[i];
            i = path.lon.indexOf(path.lon[path.po[1][j1]]) - 1;
            if (!(path.lon[i] > path.po[1][j1])) i++;
            if (path.lon[i] >= path.firstMaxX) break;
          }
        }

        path.po[2][0] = path.firstMaxX;
        i = path.lon.indexOf(path.lon[path.firstMaxX]) - 1;
        if (path.lon[i] < path.firstMaxY) {
          for (j2 = 1; j2 < n; j2++) {
            path.po[2][j2] = path.lon[i];
            i = path.lon.indexOf(path.lon[path.po[2][j2]]) - 1;
            if (!(path.lon[i] > path.po[2][j2])) i++;
            if (path.lon[i] >= path.firstMaxY) break;
          }
        }

        startOver = false;
        path.po[3][0] = path.firstMaxY;
        i = path.lon.indexOf(path.lon[path.firstMaxY]) - 1;
        if (i == -1) {
          if (path.lon[0] == path.lon[n - 1]) {
            i = path.lon.indexOf(path.lon[path.firstMaxY], path.firstMaxY) - 1;
          } else i = n - 1;
        }
        if (!(path.lon[i] > path.po[3][0])) {
          if (path.lon[(i + 1) % path.len] < path.po[3][0]) {
            startOver = true;
          } else i = (i + 1) % path.len;
        }
        if (path.lon[i] < path.firstMinX) {
          for (j3 = 1; j3 < n; j3++) {
            path.po[3][j3] = path.lon[i];
            i = path.lon.indexOf(path.lon[path.po[3][j3]]) - 1;
            if (i == -1) {
              if (path.lon[0] == path.lon[n - 1]) {
                i = path.lon.indexOf(path.lon[path.po[3][j3]],
                  path.firstMaxY) - 1;
              } else i = n - 1;
            }
            if (!(path.lon[i] > path.po[3][j3])) {
              if (path.lon[(i + 1) % path.len] < path.po[3][j3]) {
                startOver = true;
              }
              i = (i + 1) % path.len;
            }
            if (path.lon[i] >= path.firstMinX ||
              (startOver != false && path.lon[i] >= 0)) break;
          }
        }
      } else {
        startOver = false;
        path.po[0][0] = path.firstMinY;
        i = path.lon.indexOf(path.lon[path.firstMinY]) - 1;
        if (i == -1) {
          if (path.lon[0] == path.lon[n - 1]) {
            i = path.lon.indexOf(path.lon[path.firstMinY], path.firstMaxY) - 1;
          } else i = n - 1;
        }
        if (!(path.lon[i] > path.po[0][0])) {
          if (path.lon[(i + 1) % path.len] < path.po[0][0]) {
            startOver = true;
          } else i = (i + 1) % path.len;
        }
        if (path.lon[i] > path.firstMinY || path.lon[i] < path.firstMinX) {
          for (j0 = 1; j0 < n; j0++) {
            path.po[0][j0] = path.lon[i];
            i = path.lon.indexOf(path.lon[path.po[0][j0]]) - 1;
            if (i == -1) {
              if (path.lon[0] == path.lon[n - 1]) {
                i = path.lon.indexOf(path.lon[path.po[0][j0]],
                  path.firstMaxY) - 1;
              } else i = n - 1;
            }
            if (!(path.lon[i] > path.po[0][j0])) {
              if (path.lon[(i + 1) % path.len] < path.po[0][j0]) {
                startOver = true;
              } else i = (i + 1) % path.len;
            }
            if (startOver != false && path.lon[i] >= path.firstMinX) break;
          }
        }

        path.po[1][0] = path.firstMinX;
        i = path.lon.indexOf(path.lon[path.firstMinX]) - 1;
        if (i == -1) {
          if (path.lon[0] == path.lon[n - 1]) {
            i = path.lon.indexOf(path.lon[path.firstMinX], path.firstMinX) - 1;
          } else i = n - 1;
        }
        if (path.lon[i] < path.firstMaxY) {
          for (j1 = 1; j1 < n; j1++) {
            path.po[1][j1] = path.lon[i];
            i = path.lon.indexOf(path.lon[path.po[1][j1]]) - 1;
            if (!(path.lon[i] > path.po[1][j1])) i++;
            if (path.lon[i] >= path.firstMaxY) break;
          }
        }

        path.po[2][0] = path.firstMaxY;
        i = path.lon.indexOf(path.lon[path.firstMaxY]) - 1;
        if (path.lon[i] < path.firstMaxX) {
          for (j2 = 1; j2 < n; j2++) {
            path.po[2][j2] = path.lon[i];
            i = path.lon.indexOf(path.lon[path.po[2][j2]]) - 1;
            if (!(path.lon[i] > path.po[2][j2])) i++;
            if (path.lon[i] >= path.firstMaxX) break;
          }
        }

        startOver = false;
        path.po[3][0] = path.firstMaxX;
        i = path.lon.indexOf(path.lon[path.firstMaxX]) - 1
        if (i == -1) {
          if (path.lon[0] == path.lon[n - 1]) {
            i = path.lon.indexOf(path.lon[path.firstMaxX], path.firstMaxX) - 1;
          } else i = n - 1;
        }
        if (!(path.lon[i] > path.po[3][0])) {
          if (path.lon[(i + 1) % path.len] < path.po[3][0]) {
            startOver = true;
          } else i = (i + 1) % path.len;
        }
        if (path.lon[i] < path.firstMinY) {
          for (j3 = 1; j3 < n; j3++) {
            path.po[3][j3] = path.lon[i];
            i = path.lon.indexOf(path.lon[path.po[3][j3]]) - 1;
            if (i == -1) {
              if (path.lon[0] == path.lon[n - 1]) {
                i = path.lon.indexOf(path.lon[path.po[3][j3]],
                  path.firstMaxY) - 1;
              } else i = n - 1;
            }
            if (!(path.lon[i] > path.po[3][j3])) {
              if (path.lon[(i + 1) % path.len] < path.po[3][j3]) {
                startOver = true;
              }
              i = (i + 1) % path.len;
            }
            if (path.lon[i] >= path.firstMinY ||
              (startOver != false && path.lon[i] >= 0)) break;
          }
        }
      }
      path.m = 4 + j0 + j1 + j2 + j3;
      if (path.m > path.len) console.log('j0: ' + j0 + ', j1: ' + j1 + ', j2: '
        + j2 + ', j3: ' + j3 + ', sign: ' + path.sign);
    }

    for (var i = 0; i < pathlist.length; i++) {
      var path = pathlist[i];
      // console.log('pathlist index: ' + i)
      calcSums(path);
      calcLon(path);
      bestPolygon(path);
    }

    var minX, maxX, minY, maxY, midX, midY, COGX, COGY, n, isX, path = [],
      q0 = [], q1 = [], q2 = [], q3 = [], rotate, tmp;

    for (var i = 0; i < pathlist.length; i++) {
      minX = Math.round((pathlist[i].minX / scale) * 1000) / 1000;
      maxX = Math.round((pathlist[i].maxX / scale) * 1000) / 1000;
      minY = Math.round((pathlist[i].minY / scale) * 1000) / 1000;
      maxY = Math.round((pathlist[i].maxY / scale) * 1000) / 1000;
      midX = Math.round((minX + maxX) / 2 * 1000) / 1000;
      midY = Math.round((minY + maxY) / 2 * 1000) / 1000;
      width = Math.round((maxX - minX) * 1000) / 1000;
      height = Math.round((maxY - minY) * 1000) / 1000;
      COGX = ((pathlist[i].sums[pathlist[i].len].x / pathlist[i].len +
        pathlist[i].x0) / scale - midX) / width;
      COGY = ((pathlist[i].sums[pathlist[i].len].y / pathlist[i].len +
        pathlist[i].y0) / scale - midY) / height;
      q0.length = q1.length = q2.length = q3.length = 0;
      if ((maxX - minX) > (maxY - minY)) {
        if (Math.abs(COGX) > Math.abs(COGY)) {
          if (COGX > 0) {      //rotate 0 degrees
            for (var k = 0; k < pathlist[i].po[0].length; k++) {
              q0.push((pathlist[i].pt[pathlist[i].po[0][k]].x / scale -
                midX).toFixed(3),
                (pathlist[i].pt[pathlist[i].po[0][k]].y /
                  scale - midY).toFixed(3) + ' ');
            }
            for (k = 0; k < pathlist[i].po[1].length; k++) {
              q1.push((pathlist[i].pt[pathlist[i].po[1][k]].x / scale -
                midX).toFixed(3),
                (pathlist[i].pt[pathlist[i].po[1][k]].y /
                  scale - midY).toFixed(3) + ' ');
            }
            for (k = 0; k < pathlist[i].po[2].length; k++) {
              q2.push((pathlist[i].pt[pathlist[i].po[2][k]].x / scale -
                midX).toFixed(3),
                (pathlist[i].pt[pathlist[i].po[2][k]].y /
                  scale - midY).toFixed(3) + ' ');
            }
            for (k = 0; k < pathlist[i].po[3].length; k++) {
              q3.push((pathlist[i].pt[pathlist[i].po[3][k]].x / scale -
                midX).toFixed(3),
                (pathlist[i].pt[pathlist[i].po[3][k]].y /
                  scale - midY).toFixed(3) + ' ');
            }
            rotate = 0;
          }
          else {      //rotate 180 degrees
            for (var k = 0; k < pathlist[i].po[2].length; k++) {
              q0.push((-(pathlist[i].pt[pathlist[i].po[2][k]].x / scale -
                midX).toFixed(3)),
                (-(pathlist[i].pt[pathlist[i].po[2][k]].y /
                  scale - midY).toFixed(3)) + ' ');
            }
            for (k = 0; k < pathlist[i].po[3].length; k++) {
              q1.push((-(pathlist[i].pt[pathlist[i].po[3][k]].x / scale -
                midX).toFixed(3)),
                (-(pathlist[i].pt[pathlist[i].po[3][k]].y /
                  scale - midY).toFixed(3)) + ' ');
            }
            for (k = 0; k < pathlist[i].po[0].length; k++) {
              q2.push((-(pathlist[i].pt[pathlist[i].po[0][k]].x / scale -
                midX).toFixed(3)),
                (-(pathlist[i].pt[pathlist[i].po[0][k]].y /
                  scale - midY).toFixed(3)) + ' ');
            }
            for (k = 0; k < pathlist[i].po[1].length; k++) {
              q3.push((-(pathlist[i].pt[pathlist[i].po[1][k]].x / scale -
                midX).toFixed(3)),
                (-(pathlist[i].pt[pathlist[i].po[1][k]].y /
                  scale - midY).toFixed(3)) + ' ');
            }
            rotate = 180;
            COGX = - COGX;
            COGY = - COGY;
          }
        } else {
          if (COGY > 0) {      //rotate 0 degrees
            for (var k = 0; k < pathlist[i].po[0].length; k++) {
              q0.push((pathlist[i].pt[pathlist[i].po[0][k]].x / scale -
                midX).toFixed(3),
                (pathlist[i].pt[pathlist[i].po[0][k]].y /
                  scale - midY).toFixed(3) + ' ');
            }
            for (k = 0; k < pathlist[i].po[1].length; k++) {
              q1.push((pathlist[i].pt[pathlist[i].po[1][k]].x / scale -
                midX).toFixed(3),
                (pathlist[i].pt[pathlist[i].po[1][k]].y /
                  scale - midY).toFixed(3) + ' ');
            }
            for (k = 0; k < pathlist[i].po[2].length; k++) {
              q2.push((pathlist[i].pt[pathlist[i].po[2][k]].x / scale -
                midX).toFixed(3),
                (pathlist[i].pt[pathlist[i].po[2][k]].y /
                  scale - midY).toFixed(3) + ' ');
            }
            for (k = 0; k < pathlist[i].po[3].length; k++) {
              q3.push((pathlist[i].pt[pathlist[i].po[3][k]].x / scale -
                midX).toFixed(3),
                (pathlist[i].pt[pathlist[i].po[3][k]].y /
                  scale - midY).toFixed(3) + ' ');
            }
            rotate = 0;
          }
          else {      //rotate 180 degrees
            for (var k = 0; k < pathlist[i].po[2].length; k++) {
              q0.push((-(pathlist[i].pt[pathlist[i].po[2][k]].x / scale -
                midX).toFixed(3)),
                (-(pathlist[i].pt[pathlist[i].po[2][k]].y /
                  scale - midY).toFixed(3)) + ' ');
            }
            for (k = 0; k < pathlist[i].po[3].length; k++) {
              q1.push((-(pathlist[i].pt[pathlist[i].po[3][k]].x / scale -
                midX).toFixed(3)),
                (-(pathlist[i].pt[pathlist[i].po[3][k]].y /
                  scale - midY).toFixed(3)) + ' ');
            }
            for (k = 0; k < pathlist[i].po[0].length; k++) {
              q2.push((-(pathlist[i].pt[pathlist[i].po[0][k]].x / scale -
                midX).toFixed(3)),
                (-(pathlist[i].pt[pathlist[i].po[0][k]].y /
                  scale - midY).toFixed(3)) + ' ');
            }
            for (k = 0; k < pathlist[i].po[1].length; k++) {
              q3.push((-(pathlist[i].pt[pathlist[i].po[1][k]].x / scale -
                midX).toFixed(3)),
                (-(pathlist[i].pt[pathlist[i].po[1][k]].y /
                  scale - midY).toFixed(3)) + ' ');
            }
            rotate = 180;
            COGX = - COGX;
            COGY = - COGY;
          }
        }

      } else {
        if (Math.abs(COGX) > Math.abs(COGY)) {
          if (COGX < 0) {      //rotate 90 degrees
            for (var k = 0; k < pathlist[i].po[3].length; k++) {
              q0.push((pathlist[i].pt[pathlist[i].po[3][k]].y / scale -
                midY).toFixed(3),
                (-(pathlist[i].pt[pathlist[i].po[3][k]].x /
                  scale - midX).toFixed(3)) + ' ');
            }
            for (k = 0; k < pathlist[i].po[0].length; k++) {
              q1.push((pathlist[i].pt[pathlist[i].po[0][k]].y / scale -
                midY).toFixed(3),
                (-(pathlist[i].pt[pathlist[i].po[0][k]].x /
                  scale - midX).toFixed(3)) + ' ');
            }
            for (k = 0; k < pathlist[i].po[1].length; k++) {
              q2.push((pathlist[i].pt[pathlist[i].po[1][k]].y / scale -
                midY).toFixed(3),
                (-(pathlist[i].pt[pathlist[i].po[1][k]].x /
                  scale - midX).toFixed(3)) + ' ');
            }
            for (k = 0; k < pathlist[i].po[2].length; k++) {
              q3.push((pathlist[i].pt[pathlist[i].po[2][k]].y / scale -
                midY).toFixed(3),
                (-(pathlist[i].pt[pathlist[i].po[2][k]].x /
                  scale - midX).toFixed(3)) + ' ');
            }
            rotate = 90;
            tmp = - COGX;
            COGX = COGY;
            COGY = tmp;
          }
          else {      //rotate -90 degrees
            for (var k = 0; k < pathlist[i].po[1].length; k++) {
              q0.push((-(pathlist[i].pt[pathlist[i].po[1][k]].y / scale -
                midY).toFixed(3)),
                (pathlist[i].pt[pathlist[i].po[1][k]].x /
                  scale - midX).toFixed(3) + ' ');
            }
            for (k = 0; k < pathlist[i].po[2].length; k++) {
              q1.push((-(pathlist[i].pt[pathlist[i].po[2][k]].y / scale -
                midY).toFixed(3)),
                (pathlist[i].pt[pathlist[i].po[2][k]].x /
                  scale - midX).toFixed(3) + ' ');
            }
            for (k = 0; k < pathlist[i].po[3].length; k++) {
              q2.push((-(pathlist[i].pt[pathlist[i].po[3][k]].y / scale -
                midY).toFixed(3)),
                (pathlist[i].pt[pathlist[i].po[3][k]].x /
                  scale - midX).toFixed(3) + ' ');
            }
            for (k = 0; k < pathlist[i].po[0].length; k++) {
              q3.push((-(pathlist[i].pt[pathlist[i].po[0][k]].y / scale -
                midY).toFixed(3)),
                (pathlist[i].pt[pathlist[i].po[0][k]].x /
                  scale - midX).toFixed(3) + ' ');
            }
            rotate = -90;
            tmp = COGX;
            COGX = - COGY;
            COGY = tmp;
          }


        } else {
          if (COGY > 0) {      //rotate 90 degrees
            for (var k = 0; k < pathlist[i].po[3].length; k++) {
              q0.push((pathlist[i].pt[pathlist[i].po[3][k]].y / scale -
                midY).toFixed(3),
                (-(pathlist[i].pt[pathlist[i].po[3][k]].x /
                  scale - midX).toFixed(3)) + ' ');
            }
            for (k = 0; k < pathlist[i].po[0].length; k++) {
              q1.push((pathlist[i].pt[pathlist[i].po[0][k]].y / scale -
                midY).toFixed(3),
                (-(pathlist[i].pt[pathlist[i].po[0][k]].x /
                  scale - midX).toFixed(3)) + ' ');
            }
            for (k = 0; k < pathlist[i].po[1].length; k++) {
              q2.push((pathlist[i].pt[pathlist[i].po[1][k]].y / scale -
                midY).toFixed(3),
                (-(pathlist[i].pt[pathlist[i].po[1][k]].x /
                  scale - midX).toFixed(3)) + ' ');
            }
            for (k = 0; k < pathlist[i].po[2].length; k++) {
              q3.push((pathlist[i].pt[pathlist[i].po[2][k]].y / scale -
                midY).toFixed(3),
                (-(pathlist[i].pt[pathlist[i].po[2][k]].x /
                  scale - midX).toFixed(3)) + ' ');
            }
            rotate = 90;
            tmp = - COGX;
            COGX = COGY;
            COGY = tmp;
          }
          else {      //rotate -90 degrees
            for (var k = 0; k < pathlist[i].po[1].length; k++) {
              q0.push((-(pathlist[i].pt[pathlist[i].po[1][k]].y / scale -
                midY).toFixed(3)),
                (pathlist[i].pt[pathlist[i].po[1][k]].x /
                  scale - midX).toFixed(3) + ' ');
            }
            for (k = 0; k < pathlist[i].po[2].length; k++) {
              q1.push((-(pathlist[i].pt[pathlist[i].po[2][k]].y / scale -
                midY).toFixed(3)),
                (pathlist[i].pt[pathlist[i].po[2][k]].x /
                  scale - midX).toFixed(3) + ' ');
            }
            for (k = 0; k < pathlist[i].po[3].length; k++) {
              q2.push((-(pathlist[i].pt[pathlist[i].po[3][k]].y / scale -
                midY).toFixed(3)),
                (pathlist[i].pt[pathlist[i].po[3][k]].x /
                  scale - midX).toFixed(3) + ' ');
            }
            for (k = 0; k < pathlist[i].po[0].length; k++) {
              q3.push((-(pathlist[i].pt[pathlist[i].po[0][k]].y / scale -
                midY).toFixed(3)),
                (pathlist[i].pt[pathlist[i].po[0][k]].x /
                  scale - midX).toFixed(3) + ' ');
            }
            rotate = -90;
            tmp = COGX;
            COGX = - COGY;
            COGY = tmp;
          }
        }
      }

      path = [Math.round(pathlist[i].area / scale / scale),    // 0
      //  [q0,q1,q2,'0 0 '],
      [q0.slice(), q1.slice(), q2.slice(), q3.slice()],     // 1
        rotate,     // 2
        width,     // 3
        height,     // 4
        midX,     // 5
        midY,     // 6
        OverallPageNum,     // 7
      paths.length,     // 8
      (q0.length/2 > 89 ? 9 : ~~(q0.length/20))*10000000 +
      (q1.length/2 > 89 ? 9 : ~~(q1.length/20))*1000000 +
      (q2.length/2 > 89 ? 9 : ~~(q2.length/20))*100000 +
      (q3.length/2 > 89 ? 9 : ~~(q3.length/20))*10000 +
      (q0.length/2 % 10)*1000 +
      (q1.length/2 % 10)*100 +
      (q2.length/2 % 10)*10 +
      (q3.length/2 % 10),

        //  Math.abs(COGY) / Math.abs(COGX),     // 9
        COGX,     // 10
        COGY]     // 11
      paths.push(path);
    }
    resolve();
  });
}

function sort(head) {
  while (table.firstChild) {
    table.removeChild(table.firstChild);
  }
  table.insertAdjacentHTML('beforeend', '<div class="row">\
    <div class="col"></div><div class="col">Description</div>\
    <div class="col">Symbol</div><div class="col">Qty</div></div>');
  var threshold = 30;
  paths.sort(function (a, b) {
    if (a[9] < b[9]) return 1;
    if (a[9] > b[9]) return -1;
    if (a[0] < b[0]) return 1;
    if (a[0] > b[0]) return -1;
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
    lookBack = [], next = [];
    lookBack.length = 0;
    lookBack.push(paths[0][1][0].slice(), paths[0][1][1].slice(), paths[0][1][2].slice(), paths[0][1][3].slice());
  for (var l = 1; l < paths.length; l++) {
    next.length = 0;
    next.push(paths[l][1][0].slice(), paths[l][1][1].slice(), paths[l][1][2].slice(), paths[l][1][3].slice());
    differences = threshold + 1;
    if (next[0].length <= lookBack[0].length && next[1].length <= lookBack[1].length && next[2].length <= lookBack[2].length && next[3].length <= lookBack[3].length) {
      differences = 0;
      for(var m1 = 0; m1 <4; m1++){
        for (var m = 0; m < next[m1].length - 1; m++) {
          if (lookBack[m1][m] !== next[m1][m]) {
            differences += Math.pow(lookBack[m1][m] - next[m1][m], 2);
          }
          if (differences > threshold) break;
        }
      }
 
    }
    if (differences > threshold) {
      size = Math.ceil(Math.max(paths[l - 1][3], paths[l - 1][4])) + 2;
      table.insertAdjacentHTML('beforeend', '<div class="row">\
        <div class="col"></div><div class="col"><input type="text" maxlength=\
        "15" size="15" name="description" pattern=[A-Za-z][A-Za-z\d]{4,29} \
        title="Description" placeholder="' + list + paths[l - 1][8] + '"></div>\
        <div class="col"><svg xmlns="http://www.w3.org/2000/svg" width="15" \
        height="15" viewBox="' + -size / 2 + ' ' + -size / 2 + ' ' + size + ' '
        + size + '"  version="1.1"><path id="' + paths[l - quantity][8] +
        '" d="M' + lookBack.toString().replace(/[,]/g, " ") + 'z"/></svg></div>\
        <div class="col">' + quantity + '</div></div>');
      lookBack = next.slice();
      list = "";
      quantity = 1;
    } else {
      quantity++;
      list += paths[l - 1][8] + ", ";
    }
    refs[paths[l][7]] += '<use href="#' + paths[l + 1 - quantity][8] + '" x="'
      + paths[l][5] + '" y="' + paths[l][6] + '" transform="rotate(' +
      paths[l][2] + ',' + paths[l][5] + ',' + paths[l][6] + ')"/>';
  }
  size = Math.ceil(Math.max(paths[paths.length - 1][3],
    paths[paths.length - 1][4])) + 2;
  table.insertAdjacentHTML('beforeend', '<div class="row">\
    <div class="col"></div><div class="col"><input type="text" maxlength="15" \
    size="15" name="description" pattern=[A-Za-z][A-Za-z\d]{4,29} \
    title="Description" placeholder="' + list + paths[paths.length - 1][8] +
    '"></div><div class="col"><svg xmlns="http://www.w3.org/2000/svg" \
    width="15" height="15" viewBox="' + -size / 2 + ' ' + -size / 2 + ' ' + size
    + ' ' + size + '"  version="1.1"><path id="' + paths[paths.length -
    quantity][8] + '" d="M' + lookBack.toString().replace(/[,]/g, " ") + 'z"/>\
      </svg></div><div class="col">' + quantity + '</div></div>');
  sideBar.style.width = (table.offsetWidth + 5) + "px";
  for (let p = 0; p < OverallPageNumber; p++) {
    while (svgDivs[p].firstChild) {
      svgDivs[p].removeChild(svgDivs[p].firstChild);
    }
    svgDivs[p].insertAdjacentHTML('beforeend', newSVG[p] + refs[p] + '</svg>');
  }
  console.timeEnd('Execution Time');
}