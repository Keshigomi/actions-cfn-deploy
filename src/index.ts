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
import { VarUtils } from "./VarUtils";
import fs from "fs";
import { CfnUtils, IDeleteResult } from "./CfnUtils";


// async function getStackStatus(client: CloudFormationClient, stackName: string): Promise<string|undefined> {
//     const command = new DescribeStacksCommand({ StackName: stackName });
//     const response: DescribeStacksCommandOutput = await client.send(command);
//     return (response.Stacks?.filter(s => s.StackId === stackName)[0].StackStatus);
// }

// /**
//  * Waits for 1 of the specified statuses on the specified stack.
//  * @param client The CloudFormation client.
//  * @param stackName The name of the stack to wait for status on.
//  * @param timeoutSeconds The timeout after which the function will exit regardless of result. Use 0 to never time out.
//  * @param statusesToMatch List of statuses to match.`
//  * @returns a state of the stack, one of "StackNotFound", "Timeout", or "Success"
//  */
// async function waitForStackStatus(
//     client: CloudFormationClient,
//     stackName: string,
//     timeoutSeconds: number,
//     statusesToMatch: string[]
// ): Promise<IDeleteResult> {
//     const startMillis = Date.now();
//     let status: string | undefined = undefined;
//     do {
//         try {
//             status = await getStackStatus(client, stackName);
//         } catch (e) {
//             return {state: "StackNotFound"};
//         }
//         if (!status) {
//             return {state: "StackNotFound"};
//         }

//         // stack still exists, return current status if it matches
//         if (statusesToMatch.some(s => s === status)) {
//             // reached one of the requested statuses
//             return {state: "Success", currentStatus: status};
//         }
//     } while (timeoutSeconds === 0 || (Date.now() - startMillis <= (timeoutSeconds * 1000)));
//     // reached timeout. return "timeout"
//     return {state: "Timeout", currentStatus: status};
// }

// async function deleteStackIfBadStatus(client: CloudFormationClient, stackName: string, timeoutSeconds: number, succssfullyDeletedStatuses: string[]): Promise<IDeleteResult> {
//     // stack exists and is in a matching status, delete it
//     try {
//         const command = new DeleteStackCommand({
//             StackName: stackName
//         });
//         await client.send(command);

//         return await waitForStackStatus(client, stackName, timeoutSeconds, succssfullyDeletedStatuses);
//     } catch (e) {
//         return {state: "Error", error: (e as Error).message};
//     }
// }

(async (): Promise<void> => {

    const region = VarUtils.stringOrFail(core.getInput("awsRegion"), "Missing awsRegion value");
    // const accessKeyId = stringOrFail(process.env.ACCESS_KEY_ID, "Missing ACCESS_KEY_ID value");
    // const secretAccessKey = stringOrFail(process.env.SECRET_ACCESS_KEY, "Missing SECRET_ACCESS_KEY value");

    const stackName = VarUtils.stringOrFail(core.getInput("stackName"), "Missing stackName input");
    const timeoutSeconds = +core.getInput("timeoutSeconds");
    if (isNaN(timeoutSeconds)) {
        core.setFailed("timeoutSeconds must be a number equal to 0 or greater.");
        return;
    }
    const templateFilePath = VarUtils.stringOrFail(core.getInput("templateFilePath"), "Missing templateFilePath input");
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

    const cfnUtils = new CfnUtils(client, stackName);

    let currentStackStatus: string|undefined;
    try {
        currentStackStatus = await cfnUtils.getStackStatus();
    } catch(e) {
        // if (!(e instanceof CloudFormationServiceException)) {
        //     core.setFailed(`Could not get status of stack ${stackName}: ${(e as Error)?.message}`);
        //     return;
        // }
    }
    let command: any;
    let deleteResult: IDeleteResult | undefined;

    // if stack is in a "delete-before-proceeding" state, delete it
    if (deleteOnStackStatuses.includes(currentStackStatus || "")) {
        core.debug(`Stack is not in a success status: ${currentStackStatus} - deleting stack`);
        // stack is not in a successful status. Delete it before deploying.
        deleteResult = await cfnUtils.deleteStack(timeoutSeconds, ["DELETE_COMPLETE"]);
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

    if (!currentStackStatus || deleteResult) {
        // stack did not exist or was deleted
        core.debug("Stack does not exist or was deleted, creating a CREATE command");
        // CREATE
        command = new CreateStackCommand({
            StackName: stackName,
            Capabilities: ["CAPABILITY_IAM"],
            TemplateBody: templateBody,
            Tags: tags as Tag[],
            Parameters: parameters as Parameter[],
         });
    } else if (successStackStatuses.includes(currentStackStatus || "")) {
        // stack exists in a good state
        core.debug(`Stack has a success status of ${currentStackStatus}, creating UPDATE command`);
        // UPDATE
        command = new UpdateStackCommand({
            StackName: stackName,
            Capabilities: ["CAPABILITY_IAM"],
            TemplateBody: templateBody,
            Tags: tags as Tag[],
            Parameters: parameters as Parameter[]
        });
    }
    
    core.debug("Sending command to CloudFormation");
    // ready to deploy
    await client.send(command);
    
    core.debug("Waiting for a success stack status");
    const result = await cfnUtils.waitForStackStatus(timeoutSeconds, successStackStatuses);
    core.debug(`Done waiting for stack, current status: ${result.currentStatus}`);
})();
