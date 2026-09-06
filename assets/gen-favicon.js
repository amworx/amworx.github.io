// Generate AMWORX favicon PNGs using pure Node (no dependencies)
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const outDir = __dirname;

function crc32(buf) {
    let table = [];
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePNG(size, pixels) {
    // pixels: array of [r,g,b,a] per row
    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    
    // raw image data with filter byte 0 per row
    const raw = Buffer.alloc((size * 4 + 1) * size);
    for (let y = 0; y < size; y++) {
        const rowStart = y * (size * 4 + 1);
        raw[rowStart] = 0; // filter none
        for (let x = 0; x < size; x++) {
            const p = pixels[y * size + x];
            const o = rowStart + 1 + x * 4;
            raw[o] = p[0]; raw[o+1] = p[1]; raw[o+2] = p[2]; raw[o+3] = p[3];
        }
    }
    
    const idat = zlib.deflateSync(raw);
    return Buffer.concat([
        sig,
        chunk('IHDR', ihdr),
        chunk('IDAT', idat),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

function makeIcon(size) {
    // Background gradient rose->violet
    const bgTop = [244, 63, 94];   // #F43F5E
    const bgBottom = [139, 92, 246]; // #8B5CF6
    const boltColor = [255, 255, 255];
    
    const s = size;
    const rounded = size * 0.22; // corner radius
    const px = [];
    
    // Bolt polygon (normalized 0..1 space inside rounded square)
    const bolt = [
        [0.585, 0.18],
        [0.35, 0.57],
        [0.50, 0.57],
        [0.42, 0.82],
        [0.66, 0.44],
        [0.50, 0.44],
    ];
    
    function insideRoundedRect(nx, ny) {
        const x = nx * s, y = ny * s;
        // inner padding for the rounded square: from 0.12 to 0.88 normalized
        const x0 = 0.12*s, x1 = 0.88*s, y0 = 0.12*s, y1 = 0.88*s;
        const r = rounded;
        if (x < x0 || x > x1 || y < y0 || y > y1) return false;
        // corners
        const cx = Math.max(x0 + r, Math.min(x1 - r, x));
        const cy = Math.max(y0 + r, Math.min(y1 - r, y));
        const dx = x - cx, dy = y - cy;
        return (dx*dx + dy*dy) <= r*r;
    }
    
    function pointInPoly(px_, py_, poly) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i][0], yi = poly[i][1];
            const xj = poly[j][0], yj = poly[j][1];
            const intersect = ((yi > py_) !== (yj > py_)) &&
                (px_ < (xj - xi) * (py_ - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
    
    for (let y = 0; y < s; y++) {
        const ny = y / s;
        const t = ny; // gradient position
        for (let x = 0; x < s; x++) {
            const nx = x / s;
            
            if (!insideRoundedRect(nx, ny)) {
                px.push([0, 0, 0, 0]); // transparent outside
                continue;
            }
            
            // gradient bg
            let r = Math.round(bgTop[0] + (bgBottom[0] - bgTop[0]) * (ny - 0.12) / 0.76);
            let g = Math.round(bgTop[1] + (bgBottom[1] - bgTop[1]) * (ny - 0.12) / 0.76);
            let b = Math.round(bgTop[2] + (bgBottom[2] - bgTop[2]) * (ny - 0.12) / 0.76);
            
            // bolt (antialias simple: sample 4x)
            let inBolt = false;
            const sub = 3;
            for (let sy = 0; sy < sub && !inBolt; sy++) {
                for (let sx = 0; sx < sub; sx++) {
                    const px_ = nx - 0.5/s + (sx+0.5)/s/sub;
                    const py_ = ny - 0.5/s + (sy+0.5)/s/sub;
                    if (pointInPoly(px_, py_, bolt)) { inBolt = true; break; }
                }
            }
            if (inBolt) { r = boltColor[0]; g = boltColor[1]; b = boltColor[2]; }
            
            px.push([r, g, b, 255]);
        }
    }
    
    return makePNG(s, px);
}

const png32 = makeIcon(32);
const png180 = makeIcon(180);

fs.writeFileSync(path.join(outDir, 'favicon-32x32.png'), png32);
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), png180);
console.log('Favicons generated:', png32.length, 'bytes (32x32),', png180.length, 'bytes (180x180)');
