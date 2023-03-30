import * as path from "path";
import * as core from "@actions/core";
import * as aws from "aws-sdk";
import * as fs from "fs";
import {ActionUtils} from "./ActionUtils";
import {CfnHelper} from "./CfnHelper";

export type CreateStackInput = aws.CloudFormation.Types.CreateStackInput

// The custom client configuration for the CloudFormation clients.
const clientConfiguration = {
    customUserAgent: "keshigomi-actions-cfn-deploy"
};

export async function run(): Promise<void> {
    try {
        const { GITHUB_WORKSPACE = __dirname } = process.env;

        // Get inputs
        const template = core.getInput("template", { required: true });
        const stackName = core.getInput("name", { required: true });
        const capabilities = core.getInput("capabilities", {
            required: false
        });
        const parameterOverrides = core.getInput("parameter-overrides", {
            required: false
        });
        const noEmptyChangeSet = !!+core.getInput("no-fail-on-empty-changeset", {
            required: false
        });
        const noExecuteChangeSet = !!+core.getInput("no-execute-changeset", {
            required: false
        });
        const noDeleteFailedChangeSet = !!+core.getInput(
            "no-delete-failed-changeset",
            {
                required: false
            }
        );
        const disableRollback = !!+core.getInput("disable-rollback", {
            required: false
        });
        const timeoutInMinutes = ActionUtils.parseNumber(
            core.getInput("timeout-in-minutes", {
                required: false
            })
        );
        const notificationARNs = ActionUtils.parseARNs(
            core.getInput("notification-arns", {
                required: false
            })
        );
        const roleARN = ActionUtils.parseString(
            core.getInput("role-arn", {
                required: false
            })
        );
        const tags = ActionUtils.parseTags(
            core.getInput("tags", {
                required: false
            })
        );
        const terminationProtections = !!+core.getInput("termination-protection", {
            required: false
        });

        // Setup CloudFormation Stack
        let templateBody;
        let templateUrl;

        if (ActionUtils.isHttpsUrl(template)) {
            core.debug("Using CloudFormation Stack from Amazon S3 Bucket");
            templateUrl = template;
        } else {
            core.debug("Loading CloudFormation Stack template");
            const templateFilePath = path.isAbsolute(template)
                ? template
                : path.join(GITHUB_WORKSPACE, template);
            templateBody = fs.readFileSync(templateFilePath, "utf8");
        }
        const region = core.getInput("region", { required: true });

        const cfn = new aws.CloudFormation({ ...clientConfiguration, region });
        const cfnHelper = new CfnHelper(cfn);


        // CloudFormation Stack Parameter for the creation or update
        const params: CreateStackInput = {
            StackName: stackName,
            Capabilities: [...capabilities.split(",").map(c => c.trim())],
            RoleARN: roleARN,
            NotificationARNs: notificationARNs,
            DisableRollback: disableRollback,
            TimeoutInMinutes: timeoutInMinutes,
            TemplateBody: templateBody,
            TemplateURL: templateUrl,
            Tags: tags,
            EnableTerminationProtection: terminationProtections
        };

        if (parameterOverrides) {
            params.Parameters = ActionUtils.parseParameters(parameterOverrides.trim());
        }

        const stackId = await cfnHelper.deployStack(
            params,
            noEmptyChangeSet,
            noExecuteChangeSet,
            noDeleteFailedChangeSet
        );
        core.setOutput("stack-id", stackId || "UNKNOWN");

        if (stackId) {
            const outputs = await cfnHelper.getStackOutputs(stackId);
            for (const [key, value] of outputs) {
                core.setOutput(key, value);
            }
        }
    } catch (err) {
        // @ts-expect-error: Object is of type 'unknown'
        core.setFailed(err.message);
        // @ts-expect-error: Object is of type 'unknown'
        core.debug(err.stack);
    }
}

(async (): Promise<void> => await run())();
