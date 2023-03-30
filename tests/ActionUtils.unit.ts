import {ActionUtils} from "../src/ActionUtils";

describe("ActionUtils.isHttpsUrl", () => {
    it("isHttpsUrl_withUrl_returnsTrue", () => {
        // act
        const result = ActionUtils.isHttpsUrl("https://blah.com");

        // assert
        expect(result).toBeTruthy();
    });

    it.each([
        ["blah.com"],
        [undefined]
    ])
    ("isHttpsUrl_withNonUrlString_returnsFalse", (str?: string) => {
        // act
        const result = ActionUtils.isHttpsUrl(str as any);

        // assert
        expect(result).toBeFalsy();
    });
});

describe("ActionUtils.parseTags", () => {
    it("parseTags_withObjectJsonString_returnsParsedObject", () => {
        // act
        const result = ActionUtils.parseTags("{\"prop1\": \"val1\"}");

        // assert
        expect(result).toStrictEqual({prop1: "val1"});
    });

    it("parseTags_withArrayJsonString_returnsParsedArray", () => {
        // act
        const result = ActionUtils.parseTags("[{\"prop1\": \"val1\"}]");

        // assert
        expect(result).toStrictEqual([{prop1: "val1"}]);
    });

    it("parseTags_withNonJsonString_returnsUndefined", () => {
        // act
        const result = ActionUtils.parseTags("prop1=val1");

        // assert
        expect(result).toBeUndefined();
    });
});

describe("ActionUtils.parseARNs", () => {
    it("parseARNs_withCommaSeparatedList_returnsArray", () => {
        // arrange
        const arn1 = "arn:aws:blah:blah1";
        const arn2 = "arn:aws:blah:blah2";
        const arnsString = `${arn1}, ${arn2}`;

        // act
        const result = ActionUtils.parseARNs(arnsString);

        // assert
        expect(result).toHaveLength(2);
        expect(result).toStrictEqual([arn1, arn2]);
    });

    it("parseARNs_withSingleArn_returnsOneElementArray", () => {
        // arrange
        const arn = "arn:aws:blah:blah";
        const arnsString = `${arn},`;

        // act
        const result = ActionUtils.parseARNs(arnsString);

        // assert
        expect(result).toHaveLength(1);
        expect(result).toStrictEqual([arn]);
    });
});

describe("ActionUtils.parseString", () => {
    it("parseString_withValidString_returnsString", () => {
        // arrange
        const expectedString = "some string";
        
        // act
        const result = ActionUtils.parseString(expectedString);

        // assert
        expect(result).toStrictEqual(expectedString);
    });

    it.each([
        [""],
        [undefined]
    ])
    ("parseString_withEmptyOrUndefinedString_returnsUndefined", (str?: string) => {
        // act
        const result = ActionUtils.parseString(str as any);

        // assert
        expect(result).toBeFalsy();
    });
});

describe("ActionUtils.parseNumber", () => {
    it("parseNumber_withValidNumber_returnsNumber", () => {
        // arrange
        const expectedNumber = 45;
        const numberString = expectedNumber.toString();
        
        // act
        const result = ActionUtils.parseNumber(numberString);

        // assert
        expect(result).toStrictEqual(expectedNumber);
    });

    it.each([
        ["not a number"],
        [undefined]
    ])
    ("parseNumber_withNonNumberOrUndefinedString_returnsUndefined", (numberString?: string) => {
        // act
        const result = ActionUtils.parseNumber(numberString as any);

        // assert
        expect(result).toBeUndefined();
    });
});

describe("ActionUtils.parseParameters", () => {
    it.each([
        ["Param1=Value1, Param2=\"Value2\""],
        [`Param1=Value1,
        Param2="Value2"`]
    ])
    ("parseParameters_withValidParameterString_returnsParameterArray", (paramString: string) => {
        // act
        const result = ActionUtils.parseParameters(paramString);

        // assert
        expect(result).toStrictEqual([
            {ParameterKey: "Param1", ParameterValue: "Value1"},
            {ParameterKey: "Param2", ParameterValue: "Value2"}
        ]);
    });
});
