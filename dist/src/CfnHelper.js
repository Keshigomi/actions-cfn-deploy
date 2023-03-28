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
exports.CfnHelper = void 0;
const core = __importStar(require("@actions/core"));
class CfnHelper {
    constructor(cfn) {
        this.cfn = cfn;
    }
    async cleanupChangeSet(stack, params, noEmptyChangeSet, noDeleteFailedChangeSet) {
        const knownErrorMessages = [
            "No updates are to be performed",
            "The submitted information didn't contain changes"
        ];
        const changeSetStatus = await this.cfn
            .describeChangeSet({
            ChangeSetName: params.ChangeSetName,
            StackName: params.StackName
        })
            .promise();
        if (changeSetStatus.Status === "FAILED") {
            core.debug("Deleting failed Change Set");
            if (!noDeleteFailedChangeSet) {
                await this.cfn.deleteChangeSet({
                    ChangeSetName: params.ChangeSetName,
                    StackName: params.StackName
                })
                    .promise();
            }
            if (noEmptyChangeSet &&
                knownErrorMessages.some(err => { var _a; return (_a = changeSetStatus.StatusReason) === null || _a === void 0 ? void 0 : _a.includes(err); })) {
                return stack.StackId;
            }
            throw new Error(`Failed to create Change Set: ${changeSetStatus.StatusReason}`);
        }
    }
    async updateStack(stack, params, noEmptyChangeSet, noExecuteChangeSet, noDeleteFailedChangeSet) {
        core.debug("Creating CloudFormation Change Set");
        await this.cfn.createChangeSet(params).promise();
        try {
            core.debug("Waiting for CloudFormation Change Set creation");
            await this.cfn.waitFor("changeSetCreateComplete", {
                ChangeSetName: params.ChangeSetName,
                StackName: params.StackName
            })
                .promise();
        }
        catch (_) {
            return this.cleanupChangeSet(stack, params, noEmptyChangeSet, noDeleteFailedChangeSet);
        }
        if (noExecuteChangeSet) {
            core.debug("Not executing the change set");
            return stack.StackId;
        }
        core.debug("Executing CloudFormation change set");
        await this.cfn.executeChangeSet({
            ChangeSetName: params.ChangeSetName,
            StackName: params.StackName
        })
            .promise();
        core.debug("Updating CloudFormation stack");
        await this.cfn.waitFor("stackUpdateComplete", { StackName: stack.StackId }).promise();
        return stack.StackId;
    }
    async getStack(stackNameOrId) {
        var _a;
        try {
            const stacks = await this.cfn.describeStacks({
                StackName: stackNameOrId
            })
                .promise();
            return (_a = stacks.Stacks) === null || _a === void 0 ? void 0 : _a[0];
        }
        catch (e) {
            // @ts-expect-error: Object is of type 'unknown'
            if (e.code === "ValidationError" && e.message.match(/does not exist/)) {
                return undefined;
            }
            throw e;
        }
    }
    async sleep(millis) {
        return new Promise(r => setTimeout(r, millis));
    }
    async waitForStatus(stackName, statuses) {
        let stack;
        let count = 0;
        do {
            stack = await this.getStack(stackName);
            count++;
            await this.sleep(3000);
        } while (count < 40 && stack && statuses.includes(stack.StackStatus));
        return stack;
    }
    async deployStack(params, noEmptyChangeSet, noExecuteChangeSet, noDeleteFailedChangeSet) {
        const inProgressStates = [
            "CREATE_IN_PROGRESS",
            "ROLLBACK_IN_PROGRESS",
            "DELETE_IN_PROGRESS",
            "UPDATE_IN_PROGRESS",
            "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS"
        ];
        const nonUpdatableStates = [
            "ROLLBACK_COMPLETE"
        ];
        // const successStates = [
        //     // "CREATE_IN_PROGRESS",
        //     "CREATE_FAILED",
        //     "CREATE_COMPLETE",
        //     // "ROLLBACK_IN_PROGRESS",
        //     "ROLLBACK_FAILED",
        //     "ROLLBACK_COMPLETE",
        //     // "DELETE_IN_PROGRESS",
        //     "DELETE_FAILED",
        //     "DELETE_COMPLETE",
        //     // "UPDATE_IN_PROGRESS",
        //     // "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS",
        //     "UPDATE_COMPLETE",
        //     "UPDATE_FAILED",
        //     "UPDATE_ROLLBACK_IN_PROGRESS",
        //     "UPDATE_ROLLBACK_FAILED",
        //     "UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS",
        //     "UPDATE_ROLLBACK_COMPLETE",
        //     "REVIEW_IN_PROGRESS",
        //     "IMPORT_IN_PROGRESS",
        //     "IMPORT_COMPLETE",
        //     "IMPORT_ROLLBACK_IN_PROGRESS",
        //     "IMPORT_ROLLBACK_FAILED",
        //     "IMPORT_ROLLBACK_COMPLETE"
        // ];
        let stack = await this.getStack(params.StackName);
        // check if stack is in an in-progress status
        if ((stack === null || stack === void 0 ? void 0 : stack.StackStatus) && inProgressStates.includes(stack.StackStatus)) {
            // wait for a different stack status
            stack = await this.waitForStatus(params.StackName, inProgressStates);
            // let count = 0;
            // while (count < 40 && stack && inProgressStates.includes(stack.StackStatus)) {
            //     count++;
            //     await this.sleep(3000);
            //     stack = await this.getStack(params.StackName);
            // }
        }
        if ((stack === null || stack === void 0 ? void 0 : stack.StackStatus) && nonUpdatableStates.includes(stack.StackStatus)) {
            await this.cfn.deleteStack({ StackName: stack.StackName }).promise();
            await this.waitForStatus(params.StackName, ["DELETE_COMPLETE"]);
            stack = undefined;
        }
        if (!stack) {
            core.debug("Creating CloudFormation Stack");
            const stack = await this.cfn.createStack(params).promise();
            await this.cfn.waitFor("stackCreateComplete", { StackName: params.StackName }).promise();
            return stack.StackId;
        }
        return await this.updateStack(stack, {
            ChangeSetName: `${params.StackName}-CS`,
            StackName: params.StackName,
            TemplateBody: params.TemplateBody,
            TemplateURL: params.TemplateURL,
            Parameters: params.Parameters,
            Capabilities: params.Capabilities,
            ResourceTypes: params.ResourceTypes,
            RoleARN: params.RoleARN,
            RollbackConfiguration: params.RollbackConfiguration,
            NotificationARNs: params.NotificationARNs,
            Tags: params.Tags
        }, noEmptyChangeSet, noExecuteChangeSet, noDeleteFailedChangeSet);
    }
    async getStackOutputs(stackId) {
        const outputs = new Map();
        const stack = await this.getStack(stackId);
        if (stack && stack.Outputs) {
            for (const output of stack.Outputs) {
                if (output.OutputKey && output.OutputValue) {
                    outputs.set(output.OutputKey, output.OutputValue);
                }
            }
        }
        return outputs;
    }
}
exports.CfnHelper = CfnHelper;
