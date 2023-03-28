"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseParameters = exports.parseNumber = exports.parseString = exports.parseARNs = exports.parseTags = exports.isUrl = void 0;
const fs = __importStar(require("fs"));
function isUrl(s) {
    try {
        return new URL(s).protocol === "https:";
    }
    catch (_) {
        return false;
    }
}
exports.isUrl = isUrl;
function parseTags(s) {
    try {
        return JSON.parse(s);
    }
    catch (_) {
        // ignore
    }
}
exports.parseTags = parseTags;
function parseARNs(s) {
    return (s === null || s === void 0 ? void 0 : s.length) ? s.split(",") : undefined;
}
exports.parseARNs = parseARNs;
function parseString(s) {
    return (s === null || s === void 0 ? void 0 : s.length) ? s : undefined;
}
exports.parseString = parseString;
function parseNumber(s) {
    return parseInt(s) || undefined;
}
exports.parseNumber = parseNumber;
function parseParameters(parameterOverrides) {
    try {
        const path = new URL(parameterOverrides);
        const rawParameters = fs.readFileSync(path, "utf-8");
        return JSON.parse(rawParameters);
    }
    catch (err) {
        // @ts-expect-error: Object is of type 'unknown'
        if (err.code !== "ERR_INVALID_URL") {
            throw err;
        }
    }
    const parameters = new Map();
    parameterOverrides
        .split(/,(?=(?:(?:[^"']*["|']){2})*[^"']*$)/g)
        .forEach(parameter => {
        const values = parameter.trim().split("=");
        const key = values[0];
        // Corrects values that have an = in the value
        const value = values.slice(1).join("=");
        let param = parameters.get(key);
        param = !param ? value : [param, value].join(",");
        // Remove starting and ending quotes
        if ((param.startsWith("'") && param.endsWith("'")) ||
            (param.startsWith("\"") && param.endsWith("\""))) {
            param = param.substring(1, param.length - 1);
        }
        parameters.set(key, param);
    });
    return [...parameters.keys()].map(key => ({
        ParameterKey: key,
        ParameterValue: parameters.get(key)
    }));
}
exports.parseParameters = parseParameters;
