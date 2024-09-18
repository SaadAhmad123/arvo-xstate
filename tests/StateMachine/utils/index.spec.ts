import { xstateJsonResonciliator } from '../../../src/StateMachine/utils';

describe('xstateJsonResoncilator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('PRESERVE_ALL strategy', () => {
    const dicts = [
      { a: 1, b: 2, x: 1 },
      { b: 3, c: 4, x: 1 },
      { c: 2, x: 1 },
    ];
    const result = xstateJsonResonciliator(dicts, 'PRESERVE_ALL');
    expect(result).toEqual([
      { a: 1, 'b_1': 2, 'x_1': 1 },
      { 'b_2': 3, 'c_1': 4, 'x_2': 1 },
      { 'c_2': 2, 'x_3': 1 },
    ]);
  });

  test('LAST_SELECT strategy', () => {
    const dicts = [
      { a: 1, b: 2 },
      { b: 4, c: 2 },
      { x: 3, c: 4 },
    ];
    const result = xstateJsonResonciliator(dicts, 'LAST_SELECT');
    expect(result).toEqual([
      { a: 1, b: null },
      { b: 4, c: null },
      { x: 3, c: 4 },
    ]);
  });

  test('FIRST_SELECT strategy', () => {
    const dicts = [
      { a: 1, b: 2 },
      { b: 4, c: 2 },
      { x: 3, c: 4 },
    ];
    const result = xstateJsonResonciliator(dicts, 'FIRST_SELECT');
    expect(result).toEqual([
      { a: 1, b: 2 },
      { b: null, c: 2 },
      { x: 3, c: null },
    ]);
  });

  test('No conflicts', () => {
    const dicts = [
      { a: 1, b: 2 },
      { c: 3, d: 4 },
    ];
    const result = xstateJsonResonciliator(dicts, 'PRESERVE_ALL');
    expect(result).toEqual([
      { a: 1, b: 2 },
      { c: 3, d: 4 },
    ]);
  });

  test('Empty input', () => {
    const result = xstateJsonResonciliator([], 'PRESERVE_ALL');
    expect(result).toEqual([]);
  });

  test('Single dictionary input', () => {
    const dicts = [{ a: 1, b: 2 }];
    const result = xstateJsonResonciliator(dicts, 'LAST_SELECT');
    expect(result).toEqual([{ a: 1, b: 2 }]);
  });
});
