import * as p from "@clack/prompts";

export async function searchableMultiselect<Value extends string>(options: {
  message: p.AutocompleteMultiSelectOptions<Value>["message"];
  options: p.AutocompleteMultiSelectOptions<Value>["options"];
  initialValues?: p.AutocompleteMultiSelectOptions<Value>["initialValues"];
  required?: p.AutocompleteMultiSelectOptions<Value>["required"];
}): Promise<Value[]> {
  const response = await p.autocompleteMultiselect(options);

  if (p.isCancel(response)) {
    throw new Error("Selection cancelled.");
  }

  return [...response];
}
