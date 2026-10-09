import { describe, expect, it } from 'vitest';

import {
  findSlashCommandListBounds,
  findSlashCommandListEndPosition,
  writeSlashCommandDefinition,
} from './slashCommands';

const anchor =
  'var Cmd0={type:"local",name:"clear",description:"Clear the conversation"};';
const items = Array.from({ length: 31 }, (_, i) => `c${i}`).join(',');

const arrowForm = `${anchor}Cmds=memo9(()=>[${items},...Fa?[Fa]:[]])`;
const returnForm = `${anchor}function $tS(){return[${items},...Fa?[Fa]:[]]}`;

describe('findSlashCommandListEndPosition', () => {
  it('finds the closing bracket of an arrow-returned command array', () => {
    const end = findSlashCommandListEndPosition(arrowForm);

    expect(end).not.toBeNull();
    expect(arrowForm[end as number]).toBe(']');
    expect(arrowForm.slice(end as number)).toBe('])');
  });

  it('finds the closing bracket of a function-returned command array', () => {
    const end = findSlashCommandListEndPosition(returnForm);

    expect(end).not.toBeNull();
    expect(returnForm[end as number]).toBe(']');
    expect(returnForm.slice(end as number)).toBe(']}');
  });

  it('ignores small arrays and returns null when no command list exists', () => {
    expect(
      findSlashCommandListEndPosition(`${anchor}function f(){return[a,b,c]}`)
    ).toBeNull();
  });

  it('ignores large arrays that are not near command metadata', () => {
    expect(
      findSlashCommandListEndPosition(`function f(){return[${items}]}`)
    ).toBeNull();
  });

  it('picks the largest candidate when several arrays qualify', () => {
    const smaller = Array.from({ length: 30 }, (_, i) => `s${i}`).join(',');
    const file = `${anchor}function a(){return[${smaller}]}function b(){return[${items}]}`;
    const end = findSlashCommandListEndPosition(file);

    expect(end).not.toBeNull();
    expect(file.slice(end as number)).toBe(']}');
    expect(file.slice(0, end as number)).toContain('c30');
  });
});

describe('writeSlashCommandDefinition', () => {
  it('inserts the definition before the closing bracket of an arrow form', () => {
    const result = writeSlashCommandDefinition(arrowForm, ',NEW_CMD');

    expect(result).not.toBeNull();
    expect(result).toContain(',NEW_CMD])');
  });

  it('inserts the definition before the closing bracket of a return form', () => {
    const result = writeSlashCommandDefinition(returnForm, ',NEW_CMD');

    expect(result).not.toBeNull();
    expect(result).toContain(',NEW_CMD]}');
  });

  it('returns null when the command list cannot be located', () => {
    expect(writeSlashCommandDefinition('var a=1;', ',NEW_CMD')).toBeNull();
  });
});

describe('findSlashCommandListBounds', () => {
  it('finds identifier-only builtins through the exported getter', () => {
    const items = Array.from({ length: 31 }, (_, index) => `C${index}`).join(
      ','
    );
    const source =
      'var exports={};exporter(exports,{getBuiltinCommands:()=>getBuiltins,builtInCommandNames:()=>names});' +
      'function getBuiltins(){return commandList()}' +
      `commandList=memo(()=>[${items}]),` +
      'names=memo(()=>new Set(commandList().flatMap((command)=>[command.name])));';
    const bounds = findSlashCommandListBounds(source);
    expect(bounds).not.toBeNull();
    expect(source[bounds!.openBracket]).toBe('[');
    expect(source[bounds!.closingBracket]).toBe(']');
  });

  it('handles spread ternaries with nested arrays and calls', () => {
    const items = Array.from({ length: 29 }, (_, index) => `C${index}`).join(
      ','
    );
    const source =
      'var exports={};exporter(exports,{getBuiltinCommands:()=>getBuiltins,builtInCommandNames:()=>names});' +
      'function getBuiltins(){return commandList()}' +
      `commandList=memo(()=>[${items},...flag?[Optional]:[],factory({nested:[1,2]})]),` +
      'names=memo(()=>new Set(commandList().flatMap((command)=>[command.name])));';
    expect(findSlashCommandListBounds(source)).not.toBeNull();
  });

  it('rejects an identifier array without the builtins adjacency guard', () => {
    const items = Array.from({ length: 31 }, (_, index) => `C${index}`).join(
      ','
    );
    const source =
      'var exports={};exporter(exports,{getBuiltinCommands:()=>getBuiltins});' +
      'function getBuiltins(){return commandList()}' +
      `commandList=memo(()=>[${items}]);`;
    expect(findSlashCommandListBounds(source)).toBeNull();
  });
});
