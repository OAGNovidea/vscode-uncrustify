import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as vsc from 'vscode';
import * as ext from './extension';
import * as logger from './logger';
import * as util from './util';

const typesMap = {
    string: 'text',
    number: 'number',
    'false/true': 'checkbox'
}

export default class Configurator implements vsc.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vsc.Uri, token: vsc.CancellationToken) {
        let configPath = vsc.workspace.getConfiguration('uncrustify')
            .get<string>('configPath') || path.join(vsc.workspace.rootPath, util.CONFIG_FILE_NAME);

        return new Promise<string>((resolve) =>
            fs.readFile(configPath, (err, data) => resolve(data.toString())))
            .then((config) => {
                logger.dbg('generating HTML');

                let resourcepath = path.join(ext.extContext.extensionPath, 'src', 'editor');
                let html = new Node('html');
                let head = new Node('head');
                let style = new Node('link', { rel: 'stylesheet', href: path.join(resourcepath, 'uncrustify.css') }, true);
                let script = new Node('script', { src: path.join(resourcepath, 'uncrustify.js') });
                let body = new Node('body');
                let save = new Node('h3', { _: 'SAVE', id: 'save', onclick: 'save()' });
                let form = new Node('form');
                let a = new Node('a', { id: 'a', display: 'none' });

                html.children.push(head, body);
                head.children.push(style, script);
                body.children.push(save, form, a);
                form.children = parseConfig(config);

                return '<!DOCTYPE html>' + html.toString();
            });
    }
}

class Node {
    children: Node[] = [];

    get tag() {
        return this._tag;
    }

    get data() {
        return this._data;
    }

    constructor(private _tag: string, private _data = null, private _autoclose = false) { }

    toString() {
        let props = '';
        let value: String = '';

        if (typeof this._data === 'string' || this._data instanceof String) {
            value = this._data;
        } else if (this._data) {
            if (this._data._) {
                value = this._data._;
                delete this._data._;
            }

            for (let key in this._data) {
                props += ' ' + key;

                if (this._data[key] !== null) {
                    props += `="${this._data[key]}"`;
                }
            }
        }

        return `<${this._tag}${props}>${value}${this.children.map((n) => n.toString()).join('')}${this._autoclose ? '' : ('</' + this._tag + '>')}`;
    }
}

function parseConfig(config: string) {
    logger.dbg('parsing config');

    let nodes: Node[] = [];
    let table = new Node('table');
    let commentAccumulator = '';
    let instructionNode: Node;

    config.split(/\r?\n/).forEach((line) => {
        if (line.length <= 1) {
            if (line.length === 0) {
                if (commentAccumulator.length !== 0 && !instructionNode) {
                    if (table.children.length) {
                        nodes.push(table);
                    } else {
                        nodes.pop();
                    }

                    nodes.push(new Node('h2', { _: commentAccumulator, onclick: 'toggle(event)' }));
                    table = new Node('table');
                }

                if (instructionNode) {
                    let tr = new Node('tr');
                    let td = new Node('td');

                    td.children.push(new Node('p', instructionNode.data.name));
                    tr.children.push(td);
                    td = new Node('td');
                    td.children.push(instructionNode);
                    tr.children.push(td);
                    tr.children.push(new Node('td', commentAccumulator));
                    table.children.push(tr);
                }

                commentAccumulator = '';
                instructionNode = null;
            }

            return;
        }

        let comment = line.match(/^#\s*(.*)/);
        let instruction = line.match(/^(\w+)\s*=\s*(\S+)\s*#\s*(.*)/);

        if (comment) {
            commentAccumulator += os.EOL + comment[1];
        } else if (instruction) {
            instructionNode = new Node('input', {
                type: typesMap[instruction[3]],
                name: instruction[1],
                placeholder: instruction[3]
            });

            if (instructionNode.data.type === 'checkbox') {
                if (instruction[2] === 'true') {
                    instructionNode.data.checked = null;
                }
            } else {
                instructionNode.data.value = instruction[2];
            }

            let answers = instruction[3].split('/');

            if (!instructionNode.data.type) {
                if (answers.length > 1) {
                    instructionNode = new Node('select', { name: instruction[1] });
                    answers.forEach((answer) => {
                        let data: any = { _: answer, value: answer };

                        if (answer === instruction[2]) {
                            data.selected = null;
                        }

                        instructionNode.children.push(new Node('option', data));
                    });
                } else {
                    instructionNode.data.type = 'text';
                }
            }
        }
    });

    if (nodes[nodes.length - 1].tag !== 'table') {
        nodes.pop();
    }

    return nodes;
}