"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = __importDefault(require("@actions/core"));
const client_cloudformation_1 = require("@aws-sdk/client-cloudformation");
const JsonUtils_1 = require("./JsonUtils");
function stringOrFail(input, failedMessage) {
    if (input) {
        return input;
    }
    else {
        core_1.default.setFailed(failedMessage || "Uknown error");
        return "";
    }
}
const finalStatuses = [
    "CREATE_COMPLETE",
    "CREATE_FAILED",
    "DELETE_COMPLETE",
    "DELETE_FAILED",
    "ROLLBACK_COMPLETE",
    "ROLLBACK_FAILED",
    "UPDATE_COMPLETE",
    "UPDATE_ROLLBACK_COMPLETE",
    "UPDATE_ROLLBACK_FAILED"
];
async function getStackStatus(client, stackName) {
    var _a;
    const command = new client_cloudformation_1.DescribeStacksCommand({ StackName: stackName });
    const response = await client.send(command);
    return ((_a = response.Stacks) === null || _a === void 0 ? void 0 : _a.filter(s => s.StackId === stackName)[0].StackStatus);
}
/**
 * Waits for 1 of the specified statuses on the specified stack.
 * @param client The CloudFormation client.
 * @param stackName The name of the stack to wait for status on.
 * @param timeoutSeconds The timeout after which the function will exit regardless of result. Use 0 to never time out.
 * @param statusesToMatch List of statuses to match.
 * @returns a state of the stack, one of "StackNotFound", "Timeout", or "Success"
 */
async function waitForStackStatus(client, stackName, timeoutSeconds, statusesToMatch = finalStatuses) {
    const startMillis = Date.now();
    do {
        let status = undefined;
        try {
            status = await getStackStatus(client, stackName);
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
            return { state: "Success" };
        }
    } while (timeoutSeconds === 0 || (Date.now() - startMillis <= (timeoutSeconds * 1000)));
    // reached timeout. return "timeout"
    return { state: "Timeout" };
}
async function deleteStackIfBadStatus(client, stackName, timeoutSeconds, succssfullyDeletedStatuses) {
    // const currentStatus = await waitForStackStatus(client, stackName, timeoutSeconds, statusesToMatch);
    // if (["StackNotFound", "Timeout"].includes(currentStatus.state)) {
    // return currentStatus;
    // }
    // stack exists and is in a matching status, delete it
    try {
        const command = new client_cloudformation_1.DeleteStackCommand({
            StackName: stackName
        });
        await client.send(command);
        return await waitForStackStatus(client, stackName, timeoutSeconds, succssfullyDeletedStatuses);
    }
    catch (e) {
        return { state: "Error", error: e.message };
    }
}
// async function waitForDeleteSuccess(client: CloudFormationClient, stackName: string, timeoutSeconds: number = (5 * 60)): Promise<string> {
//     const finalStatuses = [
//         "CREATE_COMPLETE",
//         "CREATE_FAILED",
//         "DELETE_COMPLETE",
//         "DELETE_FAILED",
//         "ROLLBACK_COMPLETE",
//         "ROLLBACK_FAILED",
//         "UPDATE_COMPLETE",
//         "UPDATE_ROLLBACK_COMPLETE",
//         "UPDATE_ROLLBACK_FAILED"
//     ];
//     const startMillis = Date.now();
//     do {
//         const command = new DescribeStacksCommand({ StackName: stackName });
//         let status: string | undefined = undefined;
//         try {
//             let response: DescribeStacksCommandOutput = await client.send(command);
//             status = (response.Stacks && response.Stacks.filter(s => s.StackId === stackName)[0].StackStatus);
//         } catch (e) {
//             status = undefined;
//         }
//         // no exception was thrown on previous line, this means the stack still exists
//         // check if the timeout elapsed. if yes, break the loop
//         if (status && finalStatuses.some(s => s === status)) {
//             // reached final status
//             return undefined;
//         }
//         if (Date.now() - startMillis > (timeoutSeconds * 1000)) {
//             return undefined;
//         }
//     } while (true)
// }
// function toJSONArray(input: string[], keyPropertyName: string, valuePropertyName: string, separator = "="): object|undefined {
//     if (!input?.length) {
//         return undefined;
//     }
//     const result: { [key: string]: string|undefined; }[] = [];
//     input.map(line => {
//         const indexOfSeparator = line.indexOf(separator);
//         const key = line.substring(0, indexOfSeparator !== -1 ? indexOfSeparator : undefined);
//         const value = indexOfSeparator === -1 ? undefined : line.substring(indexOfSeparator);
//         result.push({[keyPropertyName]: key, [valuePropertyName]: value});
//     });
//     return result;
// }
(async () => {
    const region = stringOrFail(core_1.default.getInput("awsRegion"), "Missing awsRegion value");
    const accessKeyId = stringOrFail(process.env.ACCESS_KEY_ID, "Missing ACCESS_KEY_ID value");
    const secretAccessKey = stringOrFail(process.env.SECRET_ACCESS_KEY, "Missing SECRET_ACCESS_KEY value");
    const stackName = stringOrFail(core_1.default.getInput("stackName"), "Missing stackName input");
    const timeoutSeconds = +core_1.default.getInput("timeoutSeconds");
    if (isNaN(timeoutSeconds)) {
        core_1.default.setFailed("timeoutSeconds must be a number equal to 0 or greater.");
        return;
    }
    const templateFilePath = stringOrFail(core_1.default.getInput("templateFilePath"), "Missing templateFilePath input");
    const tags = JsonUtils_1.JsonUtils.toJSONArray(core_1.default.getMultilineInput("tags"), "Key", "Value", "=");
    const parameters = JsonUtils_1.JsonUtils.toJSONArray(core_1.default.getMultilineInput("parameterOverrides"), "ParameterKey", "ParameterValue", "=");
    const successStackStatuses = ["CREATE_COMPLETE", "ROLLBACK_COMPLETE", "UPDATE_COMPLETE"];
    const deleteOnStackStatuses = [
        // "CREATE_COMPLETE",
        "CREATE_FAILED",
        "DELETE_COMPLETE",
        "DELETE_FAILED",
        // "ROLLBACK_COMPLETE",
        "ROLLBACK_FAILED",
        // "UPDATE_COMPLETE",
        "UPDATE_ROLLBACK_COMPLETE",
        "UPDATE_ROLLBACK_FAILED"
    ];
    const client = new client_cloudformation_1.CloudFormationClient({ region, credentials: { accessKeyId, secretAccessKey } });
    let currentStackStatus;
    try {
        currentStackStatus = await getStackStatus(client, stackName);
    }
    catch (e) {
        core_1.default.setFailed(`Could not get status of stack ${stackName}`);
        return;
    }
    let command;
    if (successStackStatuses.includes(currentStackStatus || "")) {
        // UPDATE
        command = new client_cloudformation_1.UpdateStackCommand({
            StackName: stackName,
            Capabilities: ["CAPABILITY_IAM"],
            TemplateURL: `file://${templateFilePath}`,
            Tags: tags,
            Parameters: parameters // [{ParameterKey: "param1", ParameterValue: "value1"}]
        });
    }
    else if (currentStackStatus) {
        // stack is not in a successful status. Delete it before deploying.
        const deleteResult = await deleteStackIfBadStatus(client, stackName, timeoutSeconds, deleteOnStackStatuses);
        if (deleteResult.state === "Timeout") {
            core_1.default.setFailed(`Timed out while deleting stack ${stackName}`);
            return;
        }
        if (deleteResult.state === "Error") {
            core_1.default.setFailed(`Errored while deleting stack ${stackName}: ${deleteResult.error}`);
            return;
        }
    }
    if (!command) {
        // CREATE
        command = new client_cloudformation_1.CreateStackCommand({
            StackName: stackName,
            Capabilities: ["CAPABILITY_IAM"],
            TemplateURL: `file://${templateFilePath}`,
            Tags: tags,
            Parameters: parameters, // [{ParameterKey: "param1", ParameterValue: "value1"}]
        });
    }
    // ready to deploy
    await client.send(command);
    await waitForStackStatus(client, stackName, timeoutSeconds, successStackStatuses);
    // const stackIsFineResult = await waitForStackStatus(client, stackName, timeoutSeconds, successStatusesToMatch);
    // if (stackIsFineResult.state === "Timeout") {
    //     core.setFailed(`Timed out waiting for a success status on stack ${stackName}`);
    //     return;
    // }
    // if (stackIsFineResult.state === "Error") {
    //     core.setFailed(`Could not check status of the stack ${stackName}`);
    // }
    // if (!["StackNotFound", "Success"].includes(stackIsFineResult.state)) {
    //     // stack is in a 
    // }
    // const deleteResult = await deleteStackIfBadStatus(client, stackName, timeoutSeconds, statusesToMatch);
    // let error: string = undefined;
    // let stacksToDelete: string[];
    // let deletionResponses: string[];
    // // async/await.
    // try {
    //     stacksToDelete = await findStacksToDelete(client);
    //     deletionResponses = await deleteStacks(client, stacksToDelete);
    // } catch (e) {
    //     // error handling.
    //     error = JSON.stringify(e);
    // }
    // return {
    //     statusCode: 200,
    //     body: JSON.stringify({
    //         error: error,
    //         deletingStacks: stacksToDelete.length ? stacksToDelete : undefined,
    //         deletionResponses: deletionResponses.length ? deletionResponses : undefined
    //     })
    // }
})();
// async function deleteStacks(client: CloudFormationClient, stackIds: string[]): Promise<string[]> {
//     const responses: string[] = [];
//     for (let stackId of stackIds) {
//         try {
//             const command = new DeleteStackCommand({
//                 StackName: stackId
//             });
//             const response = await client.send(command);
//             responses.push(JSON.stringify(response));
//             const deleted = await waitForDeleteSuccess(client, stackId);
//             responses.push(`delete succeeded: ${deleted}`);
//         } catch (e) {
//             responses.push(JSON.stringify(e));
//         }
//     }
//     return responses;
// }
// async function findStacksToDelete(client: CloudFormationClient): Promise<string[]> {
//     const maxTtlInMillis = 12 * 60 * 60 * 1000; // 12 hours
//     const stacksToDelete: string[] = [] as string[];
//     let nextToken: string | undefined = undefined;
//     let response = undefined;
//     do {
//         const command = new DescribeStacksCommand({ NextToken: nextToken });
//         response = await client.send(command);
//         const stacks = response.Stacks;
//         if (stacks) {
//             stacksToDelete.push(...stacks
//                 .filter(s => containsDevEnvTags(s) && (getAgeMillis(s) > maxTtlInMillis))
//                 .sort(servicesFirstStackComparator)
//                 .map(s => s.StackId));
//         }
//     } while (!!(nextToken = response.NextToken))
//     return stacksToDelete;
// }
// async function waitForDeleteSuccess(client: CloudFormationClient, stackId: string, timeoutSeconds: number = (5 * 60)): Promise<string> {
//     const finalStatuses = [
//         "CREATE_COMPLETE",
//         "CREATE_FAILED",
//         "DELETE_COMPLETE",
//         "DELETE_FAILED",
//         "ROLLBACK_COMPLETE",
//         "ROLLBACK_FAILED",
//         "UPDATE_COMPLETE",
//         "UPDATE_ROLLBACK_COMPLETE",
//         "UPDATE_ROLLBACK_FAILED"
//     ];
//     const startMillis = Date.now();
//     do {
//         const command = new DescribeStacksCommand({ StackName: stackId });
//         let status: string | undefined = undefined;
//         try {
//             let response: DescribeStacksCommandOutput = await client.send(command);
//             status = (response.Stacks && response.Stacks.filter(s => s.StackId === stackId)[0].StackStatus);
//         } catch (e) {
//             status = undefined;
//         }
//         // no exception was thrown on previous line, this means the stack still exists
//         // check if the timeout elapsed. if yes, break the loop
//         if (status && finalStatuses.some(s => s === status)) {
//             // reached final status
//             return undefined;
//         }
//         if (Date.now() - startMillis > (timeoutSeconds * 1000)) {
//             return undefined;
//         }
//     } while (true)
// }
// function getAgeMillis(stack: Stack, countBackFrom: Date = new Date()): number {
//     const lastActivityDate: Date = stack.LastUpdatedTime || stack.CreationTime;
//     return countBackFrom.getTime() - lastActivityDate.getTime();
// }
// function containsDevEnvTags(stack: Stack): boolean {
//     const devTags: Tag[] = [{Key: "AutoDelete", Value: "true"}]
//     return stack.Tags && stack.Tags.some(t => devTags.some(dt => t.Key === dt.Key && t.Value === dt.Value));
// }
// const servicesFirstStackComparator = (s1: Stack, s2: Stack) =>
//     /.*-service\/[a-zA-Z0-9\-$]+/.test(s1.StackName) ? -1 : /.*-cluster\/[a-zA-Z0-9\-$]+/.test(s1.StackName) ? 1 : 0;