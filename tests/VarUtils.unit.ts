import {Mock, It, Times} from "typemoq";

const coreMock = Mock.ofType<ICoreMock>();
coreMock.setup(c => c.setFailed(It.isAny()));

jest.mock("@actions/core", () => coreMock.object);

import { VarUtils } from "../src/VarUtils";

it("stringOrFail_withUndefined_callsSetsFailMessage", () => {
    // arrange
    const expectedMessage = "Failed!";

    // act
    const result = VarUtils.stringOrFail(undefined, expectedMessage);

    // assert
    expect(result).toBe("");
    coreMock.verify(c => c.setFailed(expectedMessage), Times.once());
});

interface ICoreMock {
    setFailed(msg: string|undefined): void;
}