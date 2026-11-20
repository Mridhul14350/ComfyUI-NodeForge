// Output type for a socket that takes any of these values. Same rule as output_type in nodes/utils.py.
const INT_TEXT = /^-?\d+$/;
const FLOAT_TEXT = /^-?\d+\.\d+$/;

export function outputType(texts) {
    let type = "INT";
    let seen = false;
    for (const raw of texts) {
        seen = true;
        const text = String(raw ?? "").trim();
        if (INT_TEXT.test(text)) continue;
        if (FLOAT_TEXT.test(text)) {
            type = "FLOAT";
            continue;
        }
        return "STRING";
    }
    return seen ? type : "STRING";
}
