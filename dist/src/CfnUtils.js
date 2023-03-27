"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CfnUtils = void 0;
const client_cloudformation_1 = require("@aws-sdk/client-cloudformation");
class CfnUtils {
    constructor(client, stackName) {
        this.client = client;
        this.stackName = stackName;
    }
    async getStackStatus() {
        var _a, _b;
        const command = new client_cloudformation_1.DescribeStacksCommand({ StackName: this.stackName });
        const response = await this.client.send(command);
        return ((_b = (_a = response.Stacks) === null || _a === void 0 ? void 0 : _a.filter(s => s.StackName === this.stackName)[0]) === null || _b === void 0 ? void 0 : _b.StackStatus);
    }
    /**
     * Waits for 1 of the specified statuses on the specified stack.
     * @param client The CloudFormation client.
     * @param stackName The name of the stack to wait for status on.
     * @param timeoutSeconds The timeout after which the function will exit regardless of result. Use 0 to never time out.
     * @param statusesToMatch List of statuses to match.`
     * @returns a state of the stack, one of "StackNotFound", "Timeout", or "Success"
     */
    async waitForStackStatus(timeoutSeconds, statusesToMatch) {
        const startMillis = Date.now();
        let status = undefined;
        do {
            try {
                status = await this.getStackStatus();
            }
            catch (e) {
                return { state: "StackNotFound" };
            }
            if (!status) {
                return { state: "StackNotFound" };
            }
            // stack still exists, return current status if it matches
            if (statusesToMatch.some(s => s === status)) {
                // reached one of the requested statuses
                return { state: "Success", currentStatus: status };
            }
            await this.sleep(3000);
        } while (timeoutSeconds === 0 || (Date.now() - startMillis <= (timeoutSeconds * 1000)));
        // reached timeout. return "timeout"
        return { state: "Timeout", currentStatus: status };
    }
    async deleteStack(timeoutSeconds, successfullyDeletedStatuses) {
        // stack exists and is in a matching status, delete it
        try {
            const command = new client_cloudformation_1.DeleteStackCommand({
                StackName: this.stackName
            });
            await this.client.send(command);
            return await this.waitForStackStatus(timeoutSeconds, successfullyDeletedStatuses);
        }
        catch (e) {
            return { state: "Error", error: e.message };
        }
    }
    async sleep(millis) {
        return new Promise(r => setTimeout(r, millis));
    }
}
exports.CfnUtils = CfnUtils;
