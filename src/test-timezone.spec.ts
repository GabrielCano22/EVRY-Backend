describe('test runner timezone', () => {
  it('runs Jest with the America/Bogota timezone', () => {
    expect(process.env.TZ).toBe('America/Bogota');
  });
});
