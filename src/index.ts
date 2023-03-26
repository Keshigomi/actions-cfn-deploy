import * as core from "@actions/core";
import {
    CloudFormationClient,
    CreateStackCommand,
    DeleteStackCommand,
    DescribeStacksCommand,
    DescribeStacksCommandOutput,
    Parameter,
    Tag,
    UpdateStackCommand,
    CloudFormationServiceException
} from "@aws-sdk/client-cloudformation";
import { JsonUtils } from "./JsonUtils";
import fs from "fs";

function stringOrFail(input: string|undefined, failedMessage?: string): string {
    if (input) {
        return input;
    } else {
        core.setFailed(failedMessage || "Uknown error");
        return "";
    }
}

// const finalStatuses = [
//     "CREATE_COMPLETE",
//     "CREATE_FAILED",
//     "DELETE_COMPLETE",
//     "DELETE_FAILED",
//     "ROLLBACK_COMPLETE",
//     "ROLLBACK_FAILED",
//     "UPDATE_COMPLETE",
//     "UPDATE_ROLLBACK_COMPLETE",
//     "UPDATE_ROLLBACK_FAILED"
// ];


interface IDeleteResult {
    state: "Success"|"Error"|"Timeout"|"StackNotFound";
    currentStatus?: string,
    error?: string;
}

async function getStackStatus(client: CloudFormationClient, stackName: string): Promise<string|undefined> {
    const command = new DescribeStacksCommand({ StackName: stackName });
    const response: DescribeStacksCommandOutput = await client.send(command);
    return (response.Stacks?.filter(s => s.StackId === stackName)[0].StackStatus);
}

/**
 * Waits for 1 of the specified statuses on the specified stack.
 * @param client The CloudFormation client.
 * @param stackName The name of the stack to wait for status on.
 * @param timeoutSeconds The timeout after which the function will exit regardless of result. Use 0 to never time out.
 * @param statusesToMatch List of statuses to match.`
 * @returns a state of the stack, one of "StackNotFound", "Timeout", or "Success"
 */
async function waitForStackStatus(
    client: CloudFormationClient,
    stackName: string,
    timeoutSeconds: number,
    statusesToMatch: string[]
): Promise<IDeleteResult> {
    const startMillis = Date.now();
    let status: string | undefined = undefined;
    do {
        try {
            status = await getStackStatus(client, stackName);
        } catch (e) {
            return {state: "StackNotFound"};
        }
        if (!status) {
            return {state: "StackNotFound"};
        }

        // stack still exists, return current status if it matches
        if (statusesToMatch.some(s => s === status)) {
            // reached one of the requested statuses
            return {state: "Success", currentStatus: status};
        }
    } while (timeoutSeconds === 0 || (Date.now() - startMillis <= (timeoutSeconds * 1000)));
    // reached timeout. return "timeout"
    return {state: "Timeout", currentStatus: status};
}

async function deleteStackIfBadStatus(client: CloudFormationClient, stackName: string, timeoutSeconds: number, succssfullyDeletedStatuses: string[]): Promise<IDeleteResult> {
    // const currentStatus = await waitForStackStatus(client, stackName, timeoutSeconds, statusesToMatch);
    // if (["StackNotFound", "Timeout"].includes(currentStatus.state)) {
        // return currentStatus;
    // }

    // stack exists and is in a matching status, delete it
    try {
        const command = new DeleteStackCommand({
            StackName: stackName
        });
        await client.send(command);

        return await waitForStackStatus(client, stackName, timeoutSeconds, succssfullyDeletedStatuses);
    } catch (e) {
        return {state: "Error", error: (e as Error).message};
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

(async (): Promise<void> => {

    const region = stringOrFail(core.getInput("awsRegion"), "Missing awsRegion value");
    // const accessKeyId = stringOrFail(process.env.ACCESS_KEY_ID, "Missing ACCESS_KEY_ID value");
    // const secretAccessKey = stringOrFail(process.env.SECRET_ACCESS_KEY, "Missing SECRET_ACCESS_KEY value");

    const stackName = stringOrFail(core.getInput("stackName"), "Missing stackName input");
    const timeoutSeconds = +core.getInput("timeoutSeconds");
    if (isNaN(timeoutSeconds)) {
        core.setFailed("timeoutSeconds must be a number equal to 0 or greater.");
        return;
    }
    const templateFilePath = stringOrFail(core.getInput("templateFilePath"), "Missing templateFilePath input");
    const tags = JsonUtils.toJSONArray(core.getMultilineInput("tags"), "Key", "Value", "=");
    const parameters = JsonUtils.toJSONArray(core.getMultilineInput("parameterOverrides"), "ParameterKey", "ParameterValue", "=");
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

    let templateBody: string|undefined;
    await fs.readFile(templateFilePath, {encoding: "utf-8"}, (err, data) => {
        if (err) {
            core.setFailed(`Unable to read template file ${templateFilePath}`);
        } else {
            templateBody = data;
        }
    });
    if (!templateBody) {
        return;
    }

    const client = new CloudFormationClient({ region/* , credentials: { accessKeyId, secretAccessKey } */});

    let currentStackStatus: string|undefined;
    try {
        currentStackStatus = await getStackStatus(client, stackName);
    } catch(e) {
        if (!(e instanceof CloudFormationServiceException)) {
            core.setFailed(`Could not get status of stack ${stackName}: ${(e as Error)?.message}`);
            return;
        }
    }
    let command: any;

    if (successStackStatuses.includes(currentStackStatus || "")) {
        core.debug(`Stack has a success status of ${currentStackStatus}, creating UPDATE command`);
        // UPDATE
        command = new UpdateStackCommand({
            StackName: stackName,
            Capabilities: ["CAPABILITY_IAM"],
            TemplateBody: templateBody,
            Tags: tags as Tag[],
            Parameters: parameters as Parameter[]
        });
    } else if (currentStackStatus) {
        core.debug(`Stack is not in a success status: ${currentStackStatus} - deleting stack`);
        // stack is not in a successful status. Delete it before deploying.
        const deleteResult = await deleteStackIfBadStatus(client, stackName, timeoutSeconds, deleteOnStackStatuses);
        if (deleteResult.state === "Timeout") {
            core.setFailed(`Timed out while deleting stack ${stackName}`);
            return;
        }
        if (deleteResult.state === "Error") {
            core.setFailed(`Errored while deleting stack ${stackName}: ${deleteResult.error}`);
            return;
        }
        core.debug("Stack deletion done");
    }
    if (!command) {
        core.debug("No update command created yet, creating a CREATE command");
        // CREATE
        command = new CreateStackCommand({
            StackName: stackName,
            Capabilities: ["CAPABILITY_IAM"],
            TemplateBody: templateBody,
            Tags: tags as Tag[], // [{Key: "key1", Value: "value1"}]
            Parameters: parameters as Parameter[], // [{ParameterKey: "param1", ParameterValue: "value1"}]
         });
    }

    core.debug("Sending command to CloudFormation");
    // ready to deploy
    await client.send(command);
    
    core.debug("Waiting for a success stack status");
    const result = await waitForStackStatus(client, stackName, timeoutSeconds, successStackStatuses);
    core.debug(`Done waiting for stack, current status: ${result.currentStatus}`);



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