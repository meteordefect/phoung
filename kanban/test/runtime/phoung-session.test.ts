import { describe, expect, it } from "vitest";
import { selectPreferredPhoungModel } from "../../src/manager/phoung-model-selection.js";

describe("selectPreferredPhoungModel", () => {
	it("honors an explicit DEFAULT_MODEL match", () => {
		const selected = selectPreferredPhoungModel(
			[
				{ provider: "anthropic", id: "claude-sonnet-4-0" },
				{ provider: "openai", id: "gpt-5-mini" },
			],
			"openai/gpt-5-mini",
		);
		expect(selected).toEqual({
			provider: "openai",
			id: "gpt-5-mini",
		});
	});

	it("prefers stronger models when DEFAULT_MODEL is not set", () => {
		const selected = selectPreferredPhoungModel(
			[
				{ provider: "openai", id: "gpt-5-mini" },
				{ provider: "anthropic", id: "claude-sonnet-4-0" },
				{ provider: "anthropic", id: "claude-haiku-3-5" },
			],
			"",
		);
		expect(selected).toEqual({
			provider: "anthropic",
			id: "claude-sonnet-4-0",
		});
	});

	it("prefers GLM-5.1 over GLM-5 when DEFAULT_MODEL is not set", () => {
		const selected = selectPreferredPhoungModel(
			[
				{ provider: "zai", id: "glm-5" },
				{ provider: "zai", id: "glm-5.1" },
				{ provider: "zai", id: "glm-4.6" },
			],
			"",
		);
		expect(selected).toEqual({
			provider: "zai",
			id: "glm-5.1",
		});
	});
});
