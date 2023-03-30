import * as aws from "aws-sdk";
import { Mock, It, IMock, Times } from "typemoq";
import {CfnHelper} from "../src/CfnHelper";

describe("CfnHelper.getStackOutputs", () => {
    it("getStackOutputs_withStackWithOutputs_returnsOutputs", async () => {
        // arrange
        const expectedKey = "testKey";
        const expectedValue = "testValue";
        const expectedStackName = "stackId";
        const cfnMock = Mock.ofType<aws.CloudFormation>();
        cfnMock.setup(c => c.describeStacks(It.isAny())).returns(() =>
            mockAwsRequest(<aws.CloudFormation.DescribeStacksOutput> {
                Stacks: [{
                    Outputs: [{
                        OutputKey: expectedKey,
                        OutputValue: expectedValue
                    }]
                }]
            }).object);
        const cfnHelper = new CfnHelper(cfnMock.object);
        
        // act
        const outputsMap = await cfnHelper.getStackOutputs(expectedStackName);

        // assert
        cfnMock.verify(c => c.describeStacks(It.is<aws.CloudFormation.DescribeStacksInput>(i =>
            i.StackName === expectedStackName)), Times.once());
        expect(outputsMap).not.toBeUndefined();
        expect(Array.from(outputsMap.entries())).toHaveLength(1);
        expect(outputsMap.has(expectedKey)).toBeTruthy();
        expect(outputsMap.get(expectedKey)).toEqual(expectedValue);
    });
});

describe("CfnHelper.deployStack", () => {
    it("deployStack_withRollbackComplete_deletesStackBeforeDeploying", async () => {
        // arrange
        const expectedStackName = "stackId";
        const expectedStackId = "someStackId";
        const cfnMock = Mock.ofType<aws.CloudFormation>();
        // mock multiple calls to the same function but with different returns
        cfnMock.setup(c => c.describeStacks(It.isAny())).returns(() =>
            mockAwsRequest(<aws.CloudFormation.DescribeStacksOutput> {Stacks: [{StackStatus: "CREATE_IN_PROGRESS"}]}).object);
        cfnMock.setup(c => c.describeStacks(It.isAny())).returns(() =>
            mockAwsRequest(<aws.CloudFormation.DescribeStacksOutput> {Stacks: [{StackStatus: "ROLLBACK_COMPLETE"}]}).object);
        cfnMock.setup(c => c.describeStacks(It.isAny())).returns(() =>
            mockAwsRequest(<aws.CloudFormation.DescribeStacksOutput> {Stacks: [{StackStatus: "ROLLBACK_COMPLETE"}]}).object);
        cfnMock.setup(c => c.describeStacks(It.isAny())).returns(() =>
            mockAwsRequest(<aws.CloudFormation.DescribeStacksOutput> {Stacks: [{StackStatus: "DELETE_COMPLETE"}]}).object);
        cfnMock.setup(c => c.createStack(It.isAny())).returns(() =>
            mockAwsRequest(<aws.CloudFormation.CreateStackOutput> {StackId: expectedStackId}).object);
        cfnMock.setup(c => c.deleteStack(It.isAny())).returns(() => mockAwsRequest({}).object);
        cfnMock.setup(c => c.waitFor("stackCreateComplete", It.isAny())).returns(() => mockAwsRequest({}).object);

        const cfnHelper = new CfnHelper(cfnMock.object);
        
        // act
        const stackId = await cfnHelper.deployStack({
            StackName: expectedStackName
        }, true, true, true);

        // assert
        cfnMock.verify(c => c.createStack(It.is<aws.CloudFormation.CreateStackInput>(i =>
            i.StackName === expectedStackName)), Times.once());
        expect(stackId).toEqual(expectedStackId);
    }, 10000);
});

function mockAwsRequest<TOutput>(ret: TOutput): IMock<aws.Request<TOutput, aws.AWSError>> {
    const mock = Mock.ofType<aws.Request<TOutput, aws.AWSError>>();
    mock.setup(m => m.promise()).returns(async () => ret as any);
    return mock;
}
