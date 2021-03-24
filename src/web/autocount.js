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
      this.pt = [];
      this.minX = 100000;
      this.minY = 100000;
      this.maxX = -1;
      this.maxY = -1;
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

    // processPath

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

          if (ct[0] && ct[1] && ct[2] || ct[0] && ct[1] && ct[3] || ct[0] && ct[2] && ct[3] || ct[1] && ct[2] && ct[3]) {
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
      var i, j, n = path.len;
      path.po = new Array();
      i = path.lon.indexOf(path.lon[0], n / 2)
      if (i != -1) {
        i = i - 1
      } else {
        i = n - 1
      }
      path.po[0] = 0;
      for (j = 1; j , n; j++) {
        path.po[j] = path.lon[i];
        i = path.lon.indexOf(path.lon[path.po[j]]) - 1
        if (!(path.lon[i] > path.po[j])) {
          if (path.lon[i + 1] < path.po[j]) {
            break;
          } else {
            i++;
          }
        }
      }
      path.m = j + 1;
    }

    function reverse(path) {
      var i, j, tmp;
      for (i = 0, j = path.m - 1; i < j; i++, j--) {
        tmp = path.po[i];
        path.po[i] = path.po[j];
        path.po[j] = tmp;
      }
    }

    for (var i = 0; i < pathlist.length; i++) {
      var path = pathlist[i];
      calcSums(path);
      calcLon(path);
      bestPolygon(path);
      if (path.sign === "-") {
        reverse(path);
      }

    }
    // getSVG
    function pathGet(path) {
      function segment(i) {
        return (path.pt[path.po[i]].x / scale).toFixed(3) + ' ' +
          (path.pt[path.po[i]].y / scale).toFixed(3) + ' ';
      }

      var i, p = 'M ';
      for (i = 0; i < path.m; i++) {
        p += segment(i);
      }
      return p;
    }

    var w = bm.w / scale, h = bm.h / scale,
      len = pathlist.length, c, i;

    var svg = '<svg version="1.1" width="' + w + '" height="' + h +
      '" xmlns="http://www.w3.org/2000/svg">';
    svg += '<path d="';
    for (i = 0; i < len; i++) {
      svg += pathGet(pathlist[i]);
    }
    svg += '" stroke="black" fill="white"/></svg>';
    resolve(svg);
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
  var threshold = 10;
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
        lookBack.toString().replace(/[,]/g, " ") + 'z"/></svg></div>\
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
    '" d="' + lookBack.toString().replace(/[,]/g, " ") + 'z"/></svg></div>\
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