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
exports.run = void 0;
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const aws = __importStar(require("aws-sdk"));
const fs = __importStar(require("fs"));
const ActionUtils_1 = require("./ActionUtils");
const CfnHelper_1 = require("./CfnHelper");
// The custom client configuration for the CloudFormation clients.
const clientConfiguration = {
    customUserAgent: "keshigomi-actions-cfn-deploy"
};
async function run() {
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
        const noDeleteFailedChangeSet = !!+core.getInput("no-delete-failed-changeset", {
            required: false
        });
        const disableRollback = !!+core.getInput("disable-rollback", {
            required: false
        });
        const timeoutInMinutes = ActionUtils_1.ActionUtils.parseNumber(core.getInput("timeout-in-minutes", {
            required: false
        }));
        const notificationARNs = ActionUtils_1.ActionUtils.parseARNs(core.getInput("notification-arns", {
            required: false
        }));
        const roleARN = ActionUtils_1.ActionUtils.parseString(core.getInput("role-arn", {
            required: false
        }));
        const tags = ActionUtils_1.ActionUtils.parseTags(core.getInput("tags", {
            required: false
        }));
        const terminationProtections = !!+core.getInput("termination-protection", {
            required: false
        });
        // Setup CloudFormation Stack
        let templateBody;
        let templateUrl;
        if (ActionUtils_1.ActionUtils.isHttpsUrl(template)) {
            core.debug("Using CloudFormation Stack from Amazon S3 Bucket");
            templateUrl = template;
        }
        else {
            core.debug("Loading CloudFormation Stack template");
            const templateFilePath = path.isAbsolute(template)
                ? template
                : path.join(GITHUB_WORKSPACE, template);
            templateBody = fs.readFileSync(templateFilePath, "utf8");
        }
        const region = core.getInput("region", { required: true });
        const cfn = new aws.CloudFormation({ ...clientConfiguration, region });
        const cfnHelper = new CfnHelper_1.CfnHelper(cfn);
        // CloudFormation Stack Parameter for the creation or update
        const params = {
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
            params.Parameters = ActionUtils_1.ActionUtils.parseParameters(parameterOverrides.trim());
        }
        const stackId = await cfnHelper.deployStack(params, noEmptyChangeSet, noExecuteChangeSet, noDeleteFailedChangeSet);
        core.setOutput("stack-id", stackId || "UNKNOWN");
        if (stackId) {
            const outputs = await cfnHelper.getStackOutputs(stackId);
            for (const [key, value] of outputs) {
                core.setOutput(key, value);
            }
        }
    }
    catch (err) {
        // @ts-expect-error: Object is of type 'unknown'
        core.setFailed(err.message);
        // @ts-expect-error: Object is of type 'unknown'
        core.debug(err.stack);
    }
}
exports.run = run;
(async () => await run())();
