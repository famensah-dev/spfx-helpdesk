// The server provides the same small HTTP context used by the existing adapters.
// No browser or SPFx runtime is loaded on Azure.
exports.SPHttpClient = { configurations: { v1: {} } };
exports.SPFx = context => context;
exports.spfi = site => ({using(context) {
  return {web:{lists:{getById(id) {
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid list ID.');
    const base = `${site}/_api/web/lists(guid'${id}')/defaultview/viewfields`;
    const fields = async () => {
      const response = await context.spHttpClient.get(base, {});
      if (!response.ok) throw new Error('Unable to read the default list view.');
      const body = await response.json();
      return {Items: body.Items || body.value || body.d?.Items?.results || []};
    };
    const write = async (operation, body) => {
      const response = await context.spHttpClient.post(base + '/' + operation, {}, {body:JSON.stringify(body)});
      if (!response.ok) throw new Error('Unable to update the default list view.');
    };
    fields.add = name => write('addviewfield', {strField:name});
    fields.move = (name, index) => write('moveviewfieldto', {field:name,index});
    return {defaultView:{fields}};
  }}}};
}});
