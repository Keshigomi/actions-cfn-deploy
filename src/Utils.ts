import * as aws from "aws-sdk";
import * as fs from "fs";
import { Parameter } from "aws-sdk/clients/cloudformation";

export function isUrl(s: string): boolean {
    try {
        return new URL(s).protocol === "https:";
    } catch (_) {
        return false;
    }
}

export function parseTags(s: string): aws.CloudFormation.Tags | undefined {
    try {
        return JSON.parse(s);
    } catch (_) {
        // ignore
    }
}

export function parseARNs(s: string): string[] | undefined {
    return s?.length ? s.split(",") : undefined;
}

export function parseString(s: string): string | undefined {
    return s?.length ? s : undefined;
}

export function parseNumber(s: string): number | undefined {
    return parseInt(s) || undefined;
}

export function parseParameters(parameterOverrides: string): Parameter[] {
    try {
        const path = new URL(parameterOverrides);
        const rawParameters = fs.readFileSync(path, "utf-8");

        return JSON.parse(rawParameters);
    } catch (err) {
        // @ts-expect-error: Object is of type 'unknown'
        if (err.code !== "ERR_INVALID_URL") {
            throw err;
        }
    }

    const parameters = new Map<string, string>();
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