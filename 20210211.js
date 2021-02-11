var fs = require('fs');
var c = fs.readFileSync('src/web/W-1.svg', 'utf8');
var head = c.indexOf('<path d="') + 11;
var tail = c.indexOf('" stroke') - head;



var p = c.substr(head, tail).split(" M ");

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
        else{
            newPath += m[k] + " "
        }

    }
    path = [Math.pow(Math.pow((maxX - minX), 2) + Math.pow((maxY - minY), 2), .5), maxX - minX, maxY - minY, midX, midY, newPath]
    paths.push(path);
}
paths.sort((function(index){
    return function(a, b){
        return (a[index] === b[index] ? 0 : (a[index] < b[index] ? -1 : 1));
    };
})(0));
var newSVG = c.substr(0, head-11) + '<g fill="none" stroke="none">';
for (var l = 0; l < paths.length; l++) {
    newSVG += '<path id="'+ l +'" d="' + paths[l][5] + '"/>'
}
newSVG += '</g><g fill="none" stroke="black">'
for (var m = 0; m < paths.length; m++) {
    newSVG += '<use href="#' + m + '" x="' + paths[m][3] + '" y="' + paths[m][4] + '"/>'
}
newSVG += '</g></svg>'
fs.writeFileSync('src/web/W-1rev.svg', newSVG)
