import { CloudFormationClient, DescribeStacksCommandOutput, DescribeStacksCommand, DeleteStackCommand, DeleteStackCommandOutput } from "@aws-sdk/client-cloudformation";
import { It, Mock, Times } from "typemoq";
import {CfnUtils} from "../src/CfnUtils";

describe("CfnUtils", () => {
    it("getStackStatus_withExistingStack_returnsExpectedStatus", async () => {
        // arrange
        const expectedStackName = "MyTestStack";
        const expectedStackStatus = "CREATE_COMPLETED";
        const clientMock = Mock.ofType<CloudFormationClient>();
        clientMock.setup(c => c.send(It.isAny())).returns(async () => <DescribeStacksCommandOutput> ({
            Stacks: [{
                StackName: expectedStackName,
                StackStatus: expectedStackStatus
            }]
        }));
        const utils = new CfnUtils(clientMock.object, expectedStackName);

        // act
        const result = await utils.getStackStatus();

        // assert
        expect(result).toBe(expectedStackStatus);
    });

    it("getStackStatus_withNonExistingStack_returnsUndefined", async () => {
        // arrange
        const expectedStackName = "MyTestStack";
        const clientMock = Mock.ofType<CloudFormationClient>();
        clientMock.setup(c => c.send(It.isAny())).returns(async () => <DescribeStacksCommandOutput> ({
            Stacks: [{
                StackName: "not-expected-stack-name",
                StackStatus: "some status"
            }]
        }));
        const utils = new CfnUtils(clientMock.object, expectedStackName);

        // act
        const result = await utils.getStackStatus();

        // assert
        expect(result).toBeUndefined();
    });



    it("waitForStackStatus_withMatchingStatus_returnsSuccessState", async () => {
        // arrange
        const expectedStackName = "MyTestStack";
        const expectedStatus = "COMPLETE";
        const clientMock = Mock.ofType<CloudFormationClient>();
        clientMock.setup(c => c.send(It.isAny())).returns(async () => <DescribeStacksCommandOutput> ({
            Stacks: [{
                StackName: expectedStackName,
                StackStatus: expectedStatus
            }]
        }));
        const utils = new CfnUtils(clientMock.object, expectedStackName);

        // act
        const result = await utils.waitForStackStatus(90, [expectedStatus]);

        // assert
        expect(result).toStrictEqual({currentStatus: expectedStatus, state: "Success"});
    });

    it("waitForStackStatus_withTimeoutReachedAndNoStatusMatch_returnsTimeoutState", async () => {
        // arrange
        const expectedStackName = "MyTestStack";
        const expectedStatus = "COMPLETE";
        const actualStatus = "SomeCurrentStatus";
        const clientMock = Mock.ofType<CloudFormationClient>();
        clientMock.setup(c => c.send(It.isAny())).returns(async () => <DescribeStacksCommandOutput> ({
            Stacks: [{
                StackName: expectedStackName,
                StackStatus: actualStatus
            }]
        }));
        const utils = new CfnUtils(clientMock.object, expectedStackName);

        // act
        const startMillis = new Date().getTime();
        const result = await utils.waitForStackStatus(1, [expectedStatus]);
        const endMillis = new Date().getTime();

        // assert
        expect(result).toStrictEqual({currentStatus: actualStatus, state: "Timeout"});
        expect(endMillis - startMillis).toBeGreaterThan(1000);
    });

    it("waitForStackStatus_withTimeoutReached_waitsFor3SecondsAndCallsClientTwice", async () => {
        // arrange
        const expectedStackName = "MyTestStack";
        const expectedStatus = "COMPLETE";
        const actualStatus = "SomeCurrentStatus";
        const clientMock = Mock.ofType<CloudFormationClient>();
        clientMock.setup(c => c.send(It.isAny())).returns(async () => <DescribeStacksCommandOutput> ({
            Stacks: [{
                StackName: expectedStackName,
                StackStatus: actualStatus
            }]
        }));
        const utils = new CfnUtils(clientMock.object, expectedStackName);

        // act
        const startMillis = new Date().getTime();
        const result = await utils.waitForStackStatus(5, [expectedStatus]);
        const endMillis = new Date().getTime();

        // assert
        expect(result).toStrictEqual({currentStatus: actualStatus, state: "Timeout"});
        expect(endMillis - startMillis).toBeGreaterThan(3000);
        clientMock.verify(c => c.send(It.is<DescribeStacksCommand>(comm => comm.input?.StackName === expectedStackName)), Times.exactly(2));
    }, 10000);

    it("waitForStackStatus_withNonExistingStack_returnsStackNotFoundState", async () => {
        // arrange
        const expectedStackName = "MyTestStack";
        const expectedStatus = "COMPLETE";
        const clientMock = Mock.ofType<CloudFormationClient>();
        clientMock.setup(c => c.send(It.isAny())).returns(async () => <DescribeStacksCommandOutput> ({
            Stacks: [{
                StackName: "not-expected-stack-name",
                StackStatus: expectedStatus
            }]
        }));
        const utils = new CfnUtils(clientMock.object, expectedStackName);

        // act
        const result = await utils.waitForStackStatus(90, [expectedStatus]);

        // assert
        expect(result).toStrictEqual({state: "StackNotFound"});
    });
    
    it("waitForStackStatus_withThrowingStackStatusCheck_returnsStackNotFoundState", async () => {
        // arrange
        const expectedStackName = "MyTestStack";
        const expectedStatus = "COMPLETE";
        const clientMock = Mock.ofType<CloudFormationClient>();
        clientMock.setup(c => c.send(It.isAny())).throws(new Error("Could not get stack status: Test Validation Error"));
        const utils = new CfnUtils(clientMock.object, expectedStackName);

        // act
        const result = await utils.waitForStackStatus(90, [expectedStatus]);

        // assert
        expect(result).toStrictEqual({state: "StackNotFound"});
    });

    it("waitForStackStatus_withNonExistingStack_returnsStackNotFoundState", async () => {
        // arrange
        const expectedStackName = "MyTestStack";
        const expectedStatus = "COMPLETE";
        const clientMock = Mock.ofType<CloudFormationClient>();
        clientMock.setup(c => c.send(It.isAny())).returns(async () => <DescribeStacksCommandOutput> ({
            Stacks: [{
                StackName: "not-expected-stack-name",
                StackStatus: expectedStatus
            }]
        }));
        const utils = new CfnUtils(clientMock.object, expectedStackName);

        // act
        const result = await utils.waitForStackStatus(90, [expectedStatus]);

        // assert
        expect(result).toStrictEqual({state: "StackNotFound"});
    });

    it("deleteStack_withMatchingStack_sendsDeleteCommand", async () => {
        // arrange
        const expectedStackName = "MyTestStack";
        const expectedStatus = "COMPLETE";
        const clientMock = Mock.ofType<CloudFormationClient>();
        clientMock.setup(c => c.send(It.isAny())).returns(async () => <DescribeStacksCommandOutput> ({
            Stacks: [{
                StackName: expectedStackName,
                StackStatus: expectedStatus
            }]
        }));
        const deleteCommand = new DeleteStackCommand({StackName: expectedStackName});
        clientMock.setup(c => c.send(It.isValue(deleteCommand))).returns(async () => <DeleteStackCommandOutput> ({}));
        const utils = new CfnUtils(clientMock.object, expectedStackName);

        // act
        const result = await utils.deleteStack(90, [expectedStatus]);

        // assert
        expect(result).toStrictEqual({currentStatus: expectedStatus, state: "Success"});
        clientMock.verify(c => c.send(It.is<DeleteStackCommand>(comm => comm instanceof DeleteStackCommand && comm.input.StackName === expectedStackName)), Times.once());
    });
});