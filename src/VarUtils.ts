import * as core from "@actions/core";

export class VarUtils {
    public static stringOrFail(input: string|undefined, failedMessage?: string): string {
        if (input) {
            return input;
        } else {
            core.setFailed(failedMessage || "Uknown error");
            return "";
        }
    }    
}