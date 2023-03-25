export class JsonUtils {
    public static toJSONArray(input: string[], keyPropertyName: string, valuePropertyName: string, separator = "="): object|undefined {
        if (!input?.length) {
            return undefined;
        }
        const result: { [key: string]: string|undefined; }[] = [];
        input.map(line => {
            const indexOfSeparator = line.indexOf(separator);
            const key = line.substring(0, indexOfSeparator !== -1 ? indexOfSeparator : undefined);
            const value = indexOfSeparator === -1 ? undefined : line.substring(indexOfSeparator + 1);
            result.push({[keyPropertyName]: key, [valuePropertyName]: value});
        });
        return result;
    }
}