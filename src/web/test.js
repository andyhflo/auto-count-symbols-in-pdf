function delay(p) {
    return new Promise(resolve => setTimeout(resolve, p));
}

async function open(b, p) {
    await delay(p);
    console.log(b + ".1 opened " + p);
}
async function render(b, p) {
    await delay(p);
    console.log(b + ".2 rendered " + p);
}
async function trace(b, p) {
    await delay(p);
    console.log(b + ".3 traced " + p);
}

async function process(b, p) {
    await delay(p);
    console.log(b + ".4 processed " + p + '\n');

}

async function sort() {
    await delay(30);
    console.log("sorted" + '\n');
}
b = 1;
async function openPDF(c) {
    for (const p of c) {
        await open(b, p)
        await render(b, p / 2);
        await trace(b, p * 2);
        await process(b, p * 1.5);
        b++
    }
    await sort();
    console.log('done')
}


openPDF([1, 36, 2, 5]);
