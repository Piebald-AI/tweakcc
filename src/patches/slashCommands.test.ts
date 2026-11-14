import { describe, expect, it } from 'vitest';

import {
  findLoginCommandRefs,
  findSlashCommandListBounds,
  findSlashCommandListEndPosition,
  writeSlashCommandDefinition,
} from './slashCommands';

const anchor =
  'var Cmd0={type:"local",name:"clear",description:"Clear the conversation"};';
const login =
  'var LoginCmd=()=>({type:"local-jsx",name:"login",description:"Sign in"});';
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

  it('refuses to guess when several arrays qualify and nothing tells them apart', () => {
    const smaller = Array.from({ length: 30 }, (_, i) => `s${i}`).join(',');
    const file = `${anchor}function a(){return[${smaller}]}function b(){return[${items}]}`;

    expect(findSlashCommandListEndPosition(file)).toBeNull();
  });

  it('picks the candidate that references the /login command', () => {
    const other = Array.from({ length: 40 }, (_, i) => `o${i}`).join(',');
    const file =
      `${login}${anchor}` +
      `function a(){return[${other}]}` +
      `function b(){return[${items},LoginCmd()]}`;
    const end = findSlashCommandListEndPosition(file);

    expect(end).not.toBeNull();
    expect(file.slice(0, end as number).endsWith('LoginCmd()')).toBe(true);
  });

  it('accepts a list that references /login through an alias', () => {
    const file =
      `${login}var loginInstance=LoginCmd();${anchor}` +
      `function b(){return[${items},loginInstance]}`;

    expect(findSlashCommandListEndPosition(file)).not.toBeNull();
  });

  it('ignores /login names that only appear inside string literals', () => {
    const other = Array.from({ length: 40 }, (_, i) => `o${i}`).join(',');
    const file =
      `${login}${anchor}` +
      `function a(){return[${other},"LoginCmd",'LoginCmd',\`LoginCmd\`]}` +
      `function b(){return[${items},LoginCmd()]}`;
    const end = findSlashCommandListEndPosition(file);

    expect(end).not.toBeNull();
    expect(file.slice(0, end as number).endsWith('LoginCmd()')).toBe(true);
  });

  it('rejects a lone candidate that does not reference a defined /login', () => {
    const file = `${login}${anchor}function b(){return[${items}]}`;

    expect(findSlashCommandListEndPosition(file)).toBeNull();
  });
});

describe('findLoginCommandRefs', () => {
  it('returns the login factory and variables holding its result', () => {
    expect(
      findLoginCommandRefs(`${login}var a=LoginCmd(),$b=LoginCmd();`)
    ).toEqual(['LoginCmd', 'a', '$b']);
  });

  it('finds aliases assigned inside parentheses or a block', () => {
    expect(
      findLoginCommandRefs(`${login}(a=LoginCmd());function f(){b=LoginCmd()}`)
    ).toEqual(['LoginCmd', 'a', 'b']);
  });

  it('returns null when the bundle has no login factory', () => {
    expect(findLoginCommandRefs(anchor)).toBeNull();
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
