var fs = require('fs');
var c = fs.readFileSync('src/web/W-1.svg', 'utf8');
var head = c.indexOf('<path d="') + 11;
var tail = c.indexOf('" stroke') - head;

var p = c.substr(head, tail).split(" M ");
var threshold = 1
var minX;
var maxX;
var minY;
var maxY;
var midX;
var midY;
var n;
var isX;
var paths = [];
var path = [];
var newPath;
for (var i = 0; i < p.length; i++) {
    var m = p[i].split(/[\s,]+/);
    minX = Infinity;
    minY = Infinity;
    maxX = 0;
    maxY = 0;
    isX = true;
    for (var j = 0; j < m.length; j++) {
        if (!isNaN(m[j])) {
            n = parseFloat(m[j]);
            if (isX) {
                minX = Math.min(minX, n);
                maxX = Math.max(maxX, n);
            }
            else {
                minY = Math.min(minY, n);
                maxY = Math.max(maxY, n);
            }
            isX = !isX;
        }
    }
    midX = Math.round(((minX + maxX) / 2) * 1000) / 1000;
    midY = Math.round(((minY + maxY) / 2) * 1000) / 1000;
    newPath = "M ";
    for (var k = 0; k < m.length; k++) {
        if (!isNaN(m[k])) {
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
        else {
            newPath += m[k] + " "
        }

    }
    path = [Math.round(Math.pow(Math.pow((maxX - minX), 2) + Math.pow((maxY - minY), 2), .5) * 10000) / 10000, newPath, maxX - minX, maxY - minY, midX, midY]
    paths.push(path);
}
paths.sort(function (a, b) {
    if (a[0] > b[0]) return 1
    if (a[0] < b[0]) return -1
    if (a[1] > b[1]) {
        return 1
    }
    if (a[1] < b[1]) {
        return -1
    }
    return 0
});
var newSVG = c.substr(0, head - 11) + '<g fill="none" stroke="none"><path id="0" d="' + paths[0][1] + '"/>';
var refs = '<use href="#0" x="' + paths[0][4] + '" y="' + paths[0][5] + '"/>'
//var sheet = ""
var repeats = 0;
var lookBack = paths[0][1].split(/[\s,]+/)
var differences;
for (var l = 1; l < paths.length; l++) {
    var next = paths[l][1].split(/[\s,]+/)
    differences = threshold
    if (lookBack.length = next.length) {
        differences = 0
        for (var m = 0; m < next.length; m++) {
            if (lookBack[m] !== next[m]) {
                if (isNaN(lookBack[m]) || isNaN(next[m])) {
                    differences = threshold
                    break
                }
                differences += Math.pow(lookBack[m] - next[m], 2)
            }
            if (differences >= threshold) break
        }
    }
    if (differences >= threshold) {
        newSVG += '<path id="' + (l - repeats) + '" d="' + paths[l][1] + '"/>'
        lookBack = next
    } else {
        repeats++
    }
    refs += '<use href="#' + (l - repeats) + '" x="' + paths[l][4] + '" y="' + paths[l][5] + '"/>'
    //   sheet += (l - repeats)+ ',' + paths[l][1] + ',' + paths[l][4] + ',' + paths[l][5] + "\r\n"
}
newSVG += '</g><g fill="none" stroke="black">'
refs += '</g></svg>'
fs.writeFileSync('src/web/W-1rev.svg', newSVG + refs)
// fs.writeFileSync('src/web/W-1rev.csv', sheet)
