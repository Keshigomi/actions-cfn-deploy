import * as core from "@actions/core";
import * as aws from "aws-sdk";
// import { CreateChangeSetInput, CreateStackInput } from "./main";

type Stack = aws.CloudFormation.Stack;
type CreateStackInput = aws.CloudFormation.Types.CreateStackInput;
type CreateChangeSetInput = aws.CloudFormation.Types.CreateChangeSetInput;

export class CfnHelper {
    private readonly cfn: aws.CloudFormation;
    public constructor(cfn: aws.CloudFormation) {
        this.cfn = cfn;
    }

    public async cleanupChangeSet(
        stack: Stack,
        params: CreateChangeSetInput,
        noEmptyChangeSet: boolean,
        noDeleteFailedChangeSet: boolean
    ): Promise<string | undefined> {
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

            if (
                noEmptyChangeSet &&
                knownErrorMessages.some(err =>
                    changeSetStatus.StatusReason?.includes(err)
                )
            ) {
                return stack.StackId;
            }

            throw new Error(
                `Failed to create Change Set: ${changeSetStatus.StatusReason}`
            );
        }
    }

    private async updateStack(
        stack: Stack,
        params: CreateChangeSetInput,
        noEmptyChangeSet: boolean,
        noExecuteChangeSet: boolean,
        noDeleteFailedChangeSet: boolean
    ): Promise<string | undefined> {
        core.debug("Creating CloudFormation Change Set");
        await this.cfn.createChangeSet(params).promise();

        try {
            core.debug("Waiting for CloudFormation Change Set creation");
            await this.cfn.waitFor("changeSetCreateComplete", {
                ChangeSetName: params.ChangeSetName,
                StackName: params.StackName
            })
            .promise();
        } catch (_) {
            return this.cleanupChangeSet(
                stack,
                params,
                noEmptyChangeSet,
                noDeleteFailedChangeSet
            );
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
        await this.cfn.waitFor("stackUpdateComplete", {StackName: stack.StackId}).promise();

        return stack.StackId;
    }

    private async getStack(stackNameOrId: string): Promise<Stack | undefined> {
        try {
            const stacks = await this.cfn.describeStacks({
                StackName: stackNameOrId
            })
            .promise();
            return stacks.Stacks?.[0];
        } catch (e) {
            // @ts-expect-error: Object is of type 'unknown'
            if (e.code === "ValidationError" && e.message.match(/does not exist/)) {
                return undefined;
            }
            throw e;
        }
    }
    private async sleep(millis: number): Promise<void> {
        return new Promise(r => setTimeout(r, millis));
    }

    public async deployStack(
        params: CreateStackInput,
        noEmptyChangeSet: boolean,
        noExecuteChangeSet: boolean,
        noDeleteFailedChangeSet: boolean
    ): Promise<string | undefined> {
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

        let stack = await this.getStack(params.StackName);

        // check if stack is in an in-progress status
        if (stack?.StackStatus && inProgressStates.includes(stack.StackStatus)) {
            // wait for a different stack status
            let count = 0;
            while (count < 40 && stack && inProgressStates.includes(stack.StackStatus)) {
                count++;
                await this.sleep(3000);
                stack = await this.getStack(params.StackName);
            }
        }

        if (stack?.StackStatus && nonUpdatableStates.includes(stack.StackStatus)) {
            await this.cfn.deleteStack({StackName: stack.StackName}).promise();
            stack = undefined;
        }

        if (!stack) {
            core.debug("Creating CloudFormation Stack");

            const stack = await this.cfn.createStack(params).promise();
            await this.cfn.waitFor("stackCreateComplete", {StackName: params.StackName}).promise();

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
            },
            noEmptyChangeSet,
            noExecuteChangeSet,
            noDeleteFailedChangeSet
        );
    }

    public async getStackOutputs(stackId: string): Promise<Map<string, string>> {
        const outputs = new Map<string, string>();
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
