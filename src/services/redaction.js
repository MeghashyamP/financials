/**
 * redaction.js — find personal identifiers in statement text.
 *
 * Used before a statement page is sent to a third-party AI (Gemini): the matching spans are blacked
 * out on the rendered page image. Pure functions, no DOM, so they are unit-tested in node.
 *
 * What it catches: card / account / reference numbers (9+ digit runs, spaced or masked card numbers),
 * mobile numbers, e-mail addresses, PAN and Aadhaar-style numbers.
 * What it deliberately does NOT catch: names and postal addresses (there is no reliable way to tell
 * them from merchant names). The consent dialog says so.
 */

const PATTERNS = [
    // e-mail with a real domain (UPI handles such as name@okhdfc have no dot and are left alone)
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    // spaced / masked card numbers: 4375 51XX XXXX 1234, 4375-5100-0000-1234
    /\b(?:[0-9Xx*•]{4}[ -]){3}[0-9Xx*•]{2,4}\b/g,
    // Aadhaar-style 4-4-4
    /\b\d{4}[ -]\d{4}[ -]\d{4}\b/g,
    // mobile number written with a gap: 98765 43210
    /\b[6-9]\d{4}[ -]\d{5}\b/g,
    // PAN
    /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g,
    // any run of 9+ digits: account numbers, UPI / NEFT reference numbers, mobile numbers
    /\d{9,}/g
];

/** Returns merged [start, end) ranges of sensitive text inside `str`. */
export const findSensitiveRanges = (str) => {
    const text = String(str || '');
    if (!text) return [];
    const ranges = [];
    for (const re of PATTERNS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
            if (m[0].length === 0) { re.lastIndex++; continue; }
            ranges.push([m.index, m.index + m[0].length]);
        }
    }
    if (ranges.length === 0) return [];
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [ranges[0].slice()];
    for (let i = 1; i < ranges.length; i++) {
        const last = merged[merged.length - 1];
        if (ranges[i][0] <= last[1]) last[1] = Math.max(last[1], ranges[i][1]);
        else merged.push(ranges[i].slice());
    }
    return merged;
};

/** Text with every sensitive span replaced by block characters. */
export const redactText = (str) => {
    const text = String(str || '');
    const ranges = findSensitiveRanges(text);
    if (ranges.length === 0) return text;
    let out = '';
    let pos = 0;
    for (const [s, e] of ranges) {
        out += text.slice(pos, s) + '█'.repeat(Math.min(e - s, 12));
        pos = e;
    }
    return out + text.slice(pos);
};

/**
 * Black out sensitive spans of every text item on a rendered pdf.js page.
 * `page` is a pdf.js page proxy, `viewport` the viewport it was rendered with and `ctx` the 2D context
 * of the canvas it was rendered into. Returns how many rectangles were drawn.
 */
export const maskSensitiveTextOnCanvas = async (page, viewport, ctx, pdfjsLib) => {
    const content = await page.getTextContent();
    const Util = pdfjsLib && pdfjsLib.Util;
    if (!Util || !Util.transform) return 0;
    let drawn = 0;
    ctx.save();
    ctx.fillStyle = '#000';
    for (const item of content.items) {
        const str = item.str;
        if (!str || !str.trim()) continue;
        const ranges = findSensitiveRanges(str);
        if (ranges.length === 0) continue;
        const tx = Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.hypot(tx[2], tx[3]);
        const totalWidth = (item.width || 0) * viewport.scale;
        const perChar = totalWidth / Math.max(str.length, 1);
        for (const [s, e] of ranges) {
            // pad one character either side: glyph widths are only approximated by an even split
            const x0 = tx[4] + Math.max(0, s - 1) * perChar;
            const x1 = tx[4] + Math.min(str.length, e + 1) * perChar;
            ctx.fillRect(x0, tx[5] - fontHeight * 0.9, x1 - x0, fontHeight * 1.25);
            drawn++;
        }
    }
    ctx.restore();
    return drawn;
};
