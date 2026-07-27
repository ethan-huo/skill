import { styleText } from "node:util";

import { isCancel as isCoreCancel, MultiSelectPrompt } from "@clack/core";
import * as p from "@clack/prompts";

const PLAIN_MULTISELECT_MAX_ITEMS = 10;

type SearchableMultiselectOptions<Value extends string> = {
  message: p.AutocompleteMultiSelectOptions<Value>["message"];
  options: p.AutocompleteMultiSelectOptions<Value>["options"];
  initialValues?: p.AutocompleteMultiSelectOptions<Value>["initialValues"];
  required?: p.AutocompleteMultiSelectOptions<Value>["required"];
};

type ExclusiveMultiselectOption<Value extends string> = p.Option<Value> & {
  value: Value;
};

type ExclusiveSelectionState<Value extends string> = {
  options: Array<ExclusiveMultiselectOption<Value>>;
  values: Value[];
};

export async function searchableMultiselect<Value extends string>(options: {
  message: p.AutocompleteMultiSelectOptions<Value>["message"];
  options: p.AutocompleteMultiSelectOptions<Value>["options"];
  initialValues?: p.AutocompleteMultiSelectOptions<Value>["initialValues"];
  required?: p.AutocompleteMultiSelectOptions<Value>["required"];
}): Promise<Value[]> {
  const response = shouldUsePlainMultiselect(options.options)
    ? await p.multiselect({
        message: options.message,
        options: options.options,
        initialValues: options.initialValues,
        required: options.required,
      })
    : await p.autocompleteMultiselect(options);

  if (p.isCancel(response)) {
    throw new Error("Selection cancelled.");
  }

  return [...response];
}

export async function selectOne<Value extends string>(options: {
  message: string;
  options: Array<p.Option<Value>>;
  initialValue: Value;
}): Promise<Value> {
  const response = await p.select(options);
  if (p.isCancel(response)) {
    throw new Error("Selection cancelled.");
  }
  return response;
}

export async function exclusiveMultiselect<Value extends string>(options: {
  message: string;
  exclusiveValue: Value;
  options: Array<ExclusiveMultiselectOption<Value>>;
  initialValues?: Value[];
}): Promise<Value[]> {
  const initial = resolveExclusiveSelection({
    exclusiveValue: options.exclusiveValue,
    options: options.options,
    values: options.initialValues ?? [],
  });
  const prompt = new MultiSelectPrompt({
    options: initial.options,
    initialValues: initial.values,
    required: true,
    validate(values: Value[] | undefined) {
      if (values === undefined || values.length === 0) {
        return "Please select at least one option.";
      }
    },
    render() {
      const title = `${p.symbol(this.state)}  ${options.message}`;
      const values = this.value ?? [];
      if (this.state === "submit") {
        const selected = this.options
          .filter((option) => values.includes(option.value))
          .map((option) => option.label ?? option.value)
          .join(styleText("dim", ", "));
        return `${title}\n${styleText("gray", p.S_BAR)}  ${styleText("dim", selected)}`;
      }

      const color = this.state === "error" ? "yellow" : "cyan";
      const prefix = `${styleText(color, p.S_BAR)}  `;
      const lines = p.limitOptions({
        options: this.options,
        cursor: this.cursor,
        columnPadding: prefix.length,
        rowPadding: this.state === "error" ? 4 : 3,
        style(option, active) {
          return renderMultiselectOption(option, values.includes(option.value), active);
        },
      });
      const footer =
        this.state === "error"
          ? `${styleText("yellow", p.S_BAR_END)}  ${styleText("yellow", this.error)}`
          : styleText("cyan", p.S_BAR_END);
      return `${styleText("gray", p.S_BAR)}\n${title}\n${prefix}${lines.join(`\n${prefix}`)}\n${footer}\n`;
    },
  });

  prompt.on("cursor", (key) => {
    if (key !== "space") {
      return;
    }

    const current = prompt.options[prompt.cursor];
    applyExclusiveSelection(
      prompt,
      options.exclusiveValue,
      current?.value === options.exclusiveValue &&
        (prompt.value?.includes(options.exclusiveValue) ?? false),
    );
  });
  prompt.on("key", (char) => {
    // Clack's select-all and invert shortcuts can otherwise create a mixed state.
    if (char === "a" || char === "i") {
      applyExclusiveSelection(prompt, options.exclusiveValue, false);
    }
  });

  const response = await prompt.prompt();
  if (isCoreCancel(response)) {
    throw new Error("Selection cancelled.");
  }

  return response ?? [];
}

export function resolveExclusiveSelection<Value extends string>(options: {
  exclusiveValue: Value;
  options: Array<ExclusiveMultiselectOption<Value>>;
  values: Value[];
  preferExclusive?: boolean;
}): ExclusiveSelectionState<Value> {
  const selected = new Set(options.values);
  const hasExclusive = selected.has(options.exclusiveValue);
  const hasRegular = options.values.some((value) => value !== options.exclusiveValue);
  const exclusive = hasExclusive && (!hasRegular || options.preferExclusive === true);
  const values = exclusive
    ? [options.exclusiveValue]
    : options.values.filter((value) => value !== options.exclusiveValue);

  return {
    values,
    options: options.options.map((option) => ({
      ...option,
      disabled: exclusive
        ? option.value !== options.exclusiveValue
        : values.length > 0 && option.value === options.exclusiveValue,
    })),
  };
}

function applyExclusiveSelection<Value extends string>(
  prompt: MultiSelectPrompt<ExclusiveMultiselectOption<Value>>,
  exclusiveValue: Value,
  preferExclusive: boolean,
): void {
  const next = resolveExclusiveSelection({
    exclusiveValue,
    options: prompt.options,
    values: prompt.value ?? [],
    preferExclusive,
  });
  prompt.options = next.options;
  prompt.value = next.values;
}

function renderMultiselectOption<Value extends string>(
  option: ExclusiveMultiselectOption<Value>,
  selected: boolean,
  active: boolean,
): string {
  const label = option.label ?? option.value;
  if (option.disabled) {
    return `${styleText("gray", p.S_CHECKBOX_INACTIVE)} ${styleText(["strikethrough", "gray"], label)}`;
  }
  if (selected) {
    return `${styleText("green", p.S_CHECKBOX_SELECTED)} ${active ? label : styleText("dim", label)}`;
  }
  return `${styleText(active ? "cyan" : "dim", active ? p.S_CHECKBOX_ACTIVE : p.S_CHECKBOX_INACTIVE)} ${active ? label : styleText("dim", label)}`;
}

export function shouldUsePlainMultiselect<Value extends string>(
  options: SearchableMultiselectOptions<Value>["options"],
): options is p.MultiSelectOptions<Value>["options"] {
  return Array.isArray(options) && options.length <= PLAIN_MULTISELECT_MAX_ITEMS;
}
