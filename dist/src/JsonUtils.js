"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonUtils = void 0;
class JsonUtils {
    static toJSONArray(input, keyPropertyName, valuePropertyName, separator = "=") {
        if (!(input === null || input === void 0 ? void 0 : input.length)) {
            return undefined;
        }
        const result = [];
        input.map(line => {
            const indexOfSeparator = line.indexOf(separator);
            const key = line.substring(0, indexOfSeparator !== -1 ? indexOfSeparator : undefined);
            const value = indexOfSeparator === -1 ? undefined : line.substring(indexOfSeparator + 1);
            result.push({ [keyPropertyName]: key, [valuePropertyName]: value });
        });
        return result;
    }
}
exports.JsonUtils = JsonUtils;
