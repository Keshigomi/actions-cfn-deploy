import {JsonUtils} from "../src/JsonUtils";

it("toJSONArray_withUndefinedInput_returnsUndefined", () => {
    // act
    const result = JsonUtils.toJSONArray(undefined!, "Key", "Value");

    expect(result).toBeUndefined();
});


it("toJSONArray_withOneLineValidInput_returnsObject", () => {
    // arrange
    const input = ["blah=test"];
    
    // act
    const result = JsonUtils.toJSONArray(input, "Key", "Value");

    expect(result).toStrictEqual([{Key: "blah", Value: "test"}]);
});

it("toJSONArray_withInputWithEmptyValue_returnsObject", () => {
    // arrange
    const input = ["blah="];
    
    // act
    const result = JsonUtils.toJSONArray(input, "Key", "Value");

    expect(result).toStrictEqual([{Key: "blah", Value: ""}]);
});

it("toJSONArray_withMultiLineValidInput_returnsObject", () => {
    // arrange
    const input = ["blah=test", "blah2="];
    
    // act
    const result = JsonUtils.toJSONArray(input, "Key", "Value");

    expect(result).toStrictEqual([{Key: "blah", Value: "test"}, {Key: "blah2", Value: ""}]);
});

it("toJSONArray_withMultiLineValidInputAndCustomSeparator_returnsObject", () => {
    // arrange
    const input = ["blah:test", "blah2:"];
    
    // act
    const result = JsonUtils.toJSONArray(input, "ParamKey", "ParamValue", ":");

    expect(result).toStrictEqual([{ParamKey: "blah", ParamValue: "test"}, {ParamKey: "blah2", ParamValue: ""}]);
});
