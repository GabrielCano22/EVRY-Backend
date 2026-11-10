import { applyReviewedNamePlan } from './apply-reviewed-name-plan';

it('updates only the exact verified built-in name and preserves other fields', async () => {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const change = { id: 'stable-id', sourceId: '0001', expected: 'Anterior', replacement: 'Revisado' };
  await expect(applyReviewedNamePlan({ exercise: { updateMany } } as never, [change])).resolves.toBe(1);
  expect(updateMany).toHaveBeenCalledWith({ where: { id: 'stable-id', sourceId: '0001', name: 'Anterior', isCustom: false, ownerId: null }, data: { name: 'Revisado' } });
});

it('aborts when the name changed concurrently', async () => {
  const updateMany = jest.fn().mockResolvedValue({ count: 0 });
  await expect(applyReviewedNamePlan({ exercise: { updateMany } } as never,
    [{ id: 'stable-id', sourceId: '0001', expected: 'Anterior', replacement: 'Revisado' }])).rejects.toThrow(/revirtió todo el lote/);
});
