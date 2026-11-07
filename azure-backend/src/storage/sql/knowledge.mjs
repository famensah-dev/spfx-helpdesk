import { ApiError } from '../../tokens.mjs';
export function sqlKnowledge(repository, canManage, access) {
    const requireManager = () => { if (!canManage)
        throw new ApiError('Knowledge Base management access is required.'); };
    return {
        getFaqAccess: async () => ({ ...await access(), canManage, canSubmitDraft: false }),
        getFaqs: async (manage) => { if (manage)
            requireManager(); return (await repository.list('article')).filter(row => manage || row.published).map(({ id, version, ...row }) => ({ ...row, id })).sort((a, b) => a.sortOrder - b.sortOrder || a.question.localeCompare(b.question)); },
        saveFaq: async (input, id) => { requireManager(); if (typeof input.question !== 'string' || !input.question.trim() || input.question.length > 255 || typeof input.answer !== 'string' || input.answer.length > 1000000 || typeof input.published !== 'boolean')
            throw new ApiError('Enter a valid article title and content.', 400); const value = { question: input.question, answer: input.answer, category: input.category || '', subcategory: input.subcategory || '', categoryId: input.categoryId, subcategoryId: input.subcategoryId, keywords: input.keywords || '', published: input.published, sortOrder: Number(input.sortOrder) || 0, sourceTicketId: input.sourceTicketId, modified: new Date().toISOString() }; if (id) {
            const row = await repository.get('article', id);
            if (!row)
                throw new ApiError('Article not found.', 404);
            await repository.replace('article', id, value, row.version);
        }
        else
            await repository.insert('article', value); },
        deleteFaq: async (id) => { requireManager(); const row = await repository.get('article', id); if (!row)
            throw new ApiError('Article not found.', 404); await repository.remove('article', id, row.version); },
        updateFaqs: async (ids, action) => {
            requireManager();
            if (!Array.isArray(ids) || ids.length > 200)
                throw new ApiError('Select up to 200 articles.', 400);
            const result = { succeeded: [], failed: [] }, unique = [...new Set(ids)];
            for (const [index, id] of unique.entries())
                try {
                    const row = await repository.get('article', id);
                    if (!row)
                        throw new ApiError('Article not found.', 404);
                    if (action.kind === 'delete')
                        await repository.remove('article', id, row.version);
                    else if (['publish', 'sort'].includes(action.kind))
                        await repository.replace('article', id, { ...row, ...(action.kind === 'sort' ? { sortOrder: index + 1 } : { published: Boolean(action.published) }), modified: new Date().toISOString() }, row.version);
                    else
                        throw new ApiError('Unsupported article action.', 400);
                    result.succeeded.push(id);
                }
                catch (error) {
                    result.failed.push({ id, message: error.message });
                }
            return result;
        }
    };
}
