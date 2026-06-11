import * as p from "@clack/prompts";

const PLAIN_MULTISELECT_MAX_ITEMS = 10;

type SearchableMultiselectOptions<Value extends string> = {
  message: p.AutocompleteMultiSelectOptions<Value>["message"];
  options: p.AutocompleteMultiSelectOptions<Value>["options"];
  initialValues?: p.AutocompleteMultiSelectOptions<Value>["initialValues"];
  required?: p.AutocompleteMultiSelectOptions<Value>["required"];
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
  message: p.SelectOptions<Value>["message"];
  options: p.SelectOptions<Value>["options"];
  initialValue?: p.SelectOptions<Value>["initialValue"];
}): Promise<Value> {
  const response = await p.select(options);

  if (p.isCancel(response)) {
    throw new Error("Selection cancelled.");
  }

  return response;
}

export function shouldUsePlainMultiselect<Value extends string>(
  options: SearchableMultiselectOptions<Value>["options"],
): options is p.MultiSelectOptions<Value>["options"] {
  return Array.isArray(options) && options.length <= PLAIN_MULTISELECT_MAX_ITEMS;
}
