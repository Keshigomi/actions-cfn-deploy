import {
    CloudFormationClient,
    // CreateStackCommand,
    DeleteStackCommand,
    DescribeStacksCommand,
    DescribeStacksCommandOutput,
    // Parameter,
    // Tag,
    // UpdateStackCommand,
    // CloudFormationServiceException
} from "@aws-sdk/client-cloudformation";

export class CfnUtils {
    private readonly client: CloudFormationClient;
    private readonly stackName: string;

    public constructor(client: CloudFormationClient, stackName: string) {
        this.client = client;
        this.stackName = stackName;
    }

    public async getStackStatus(): Promise<string|undefined> {
        const command = new DescribeStacksCommand({ StackName: this.stackName });
        const response: DescribeStacksCommandOutput = await this.client.send(command);
        return (response.Stacks?.filter(s => s.StackName === this.stackName)[0]?.StackStatus);
    }

    /**
     * Waits for 1 of the specified statuses on the specified stack.
     * @param client The CloudFormation client.
     * @param stackName The name of the stack to wait for status on.
     * @param timeoutSeconds The timeout after which the function will exit regardless of result. Use 0 to never time out.
     * @param statusesToMatch List of statuses to match.`
     * @returns a state of the stack, one of "StackNotFound", "Timeout", or "Success"
     */
    public async waitForStackStatus(timeoutSeconds: number, statusesToMatch: string[]): Promise<IDeleteResult> {
        const startMillis = Date.now();
        let status: string | undefined = undefined;
        do {
            try {
                status = await this.getStackStatus();
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
            await this.sleep(3000);
        } while (timeoutSeconds === 0 || (Date.now() - startMillis <= (timeoutSeconds * 1000)));
        // reached timeout. return "timeout"
        return {state: "Timeout", currentStatus: status};
    }


    public async deleteStack(timeoutSeconds: number, successfullyDeletedStatuses: string[]): Promise<IDeleteResult> {
        // stack exists and is in a matching status, delete it
        try {
            const command = new DeleteStackCommand({
                StackName: this.stackName
            });
            await this.client.send(command);
    
            return await this.waitForStackStatus(timeoutSeconds, successfullyDeletedStatuses);
        } catch (e) {
            return {state: "Error", error: (e as Error).message};
        }
    }

    private async sleep(millis: number): Promise<void> {
        return new Promise(r => setTimeout(r, millis));
    }
}

export interface IDeleteResult {
    state: "Success"|"Error"|"Timeout"|"StackNotFound";
    currentStatus?: string;
    error?: string;
}
