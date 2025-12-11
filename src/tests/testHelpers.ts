import type { Stats } from 'node:fs';

export const createEnoent = () => {
  const error: NodeJS.ErrnoException = new Error(
    'ENOENT: no such file or directory'
  );
  error.code = 'ENOENT';
  return error;
};

export const createEnotdir = () => {
  const error: NodeJS.ErrnoException = new Error('ENOTDIR: not a directory');
  error.code = 'ENOTDIR';
  return error;
};

export const createEacces = () => {
  const error: NodeJS.ErrnoException = new Error('EACCES: permission denied');
  error.code = 'EACCES';
  return error;
};

export const createEperm = () => {
  const error: NodeJS.ErrnoException = new Error(
    'EPERM: operation not permitted'
  );
  error.code = 'EPERM';
  return error;
};

export const createSymlinkStats = (): Stats =>
  ({
    isSymbolicLink: () => true,
  }) as unknown as Stats;

export const createRegularStats = (): Stats =>
  ({
    isSymbolicLink: () => false,
  }) as unknown as Stats;
