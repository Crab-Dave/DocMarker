import os
import json
import re
import shutil
import csv
import PyPDF2
from flask import Flask, render_template, jsonify, request, send_from_directory
from shutil import copy2
from openpyxl import Workbook

app = Flask(__name__)
DOC_DIR = "documents"
DATA_FILE = "data/marks.json"
SETTINGS_FILE = "data/settings.json"
ALLOWED_EXTENSIONS = ['.pdf', '.txt']
EXPORT_DIR = "exports"

# 初始化必要的目录和文件
os.makedirs("data", exist_ok=True)
os.makedirs(DOC_DIR, exist_ok=True)
if not os.path.exists(DATA_FILE):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump({}, f)

if not os.path.exists(SETTINGS_FILE):
    default_settings = {
        "keyBindings": {
            "markA": "ArrowLeft",
            "markB": "ArrowRight",
            "prev": "ArrowUp",
            "next": "ArrowDown"
        },
        "colors": {
            "A": "#ffe0e0",  # 默认颜色A
            "B": "#e0f0ff"   # 默认颜色B
        }
    }
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(default_settings, f, ensure_ascii=False, indent=2)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/files')
def list_files():
    files = [f for f in os.listdir(DOC_DIR)
             if os.path.splitext(f)[1].lower() in ALLOWED_EXTENSIONS]

    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        try:
            marks = json.load(f)
        except json.JSONDecodeError:
            marks = {}

    return jsonify({"files": files, "marks": marks})

@app.route('/api/file/<path:filename>')
def get_file(filename):
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return "Invalid file", 400
    return send_from_directory(os.path.abspath(DOC_DIR), filename)

@app.route('/api/mark', methods=['POST'])
def save_mark():
    data = request.json
    filename = data['filename']
    mark = data['mark']

    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        try:
            marks = json.load(f)
        except json.JSONDecodeError:
            marks = {}

    marks[filename] = mark

    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(marks, f, ensure_ascii=False, indent=2)

    return jsonify(success=True)

@app.route('/api/export', methods=['POST'])
def export_files():
    data = request.json
    selected_colors = data.get("colors", [])

    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        marks = json.load(f)

    existing_files = set(os.listdir(DOC_DIR))
    valid_marks = {k: v for k, v in marks.items() if k in existing_files}
    removed = set(marks.keys()) - set(valid_marks.keys())

    if removed:
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(valid_marks, f, ensure_ascii=False, indent=2)

    if os.path.exists(EXPORT_DIR):
        shutil.rmtree(EXPORT_DIR)
    os.makedirs(EXPORT_DIR, exist_ok=True)

    exported_files = []
    for filename, mark in valid_marks.items():
        if mark in selected_colors:
            src_path = os.path.join(DOC_DIR, filename)
            dest_subdir = os.path.join(EXPORT_DIR, mark)
            os.makedirs(dest_subdir, exist_ok=True)
            dest_path = os.path.join(dest_subdir, filename)
            copy2(src_path, dest_path)
            exported_files.append({
                'filename': filename,
                'mark': mark,
                'path': os.path.abspath(dest_path)
            })

    # 写 CSV 报告
    csv_path = os.path.join(EXPORT_DIR, 'report.csv')
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['文件名', '标记', '导出路径'])
        for item in exported_files:
            writer.writerow([item['filename'], item['mark'], item['path']])

    # 写 XLSX 报告
    xlsx_path = os.path.join(EXPORT_DIR, 'report.xlsx')
    wb = Workbook()
    ws = wb.active
    ws.title = "导出结果"
    ws.append(['文件名', '标记', '导出路径'])
    for item in exported_files:
        ws.append([item['filename'], item['mark'], item['path']])
    wb.save(xlsx_path)

    return jsonify({
        "exported": [f['filename'] for f in exported_files],
        "removed": list(removed)
    })

@app.route('/api/filter', methods=['POST'])
def filter_files():
    data = request.json
    file_name_regex = data.get('fileNameRegex', '').strip()
    min_length = int(data.get('minLength', 0))
    max_length = int(data.get('maxLength', 10000000))  # 默认上限很大
    mark_color = data.get('markColor', 'A')  # 从前端获取标记颜色

    print(f"[筛选] 条件：文件名正则={file_name_regex}, 长度={min_length}~{max_length}, 颜色={mark_color}")

    try:
        regex = re.compile(file_name_regex) if file_name_regex else None
    except re.error:
        return jsonify({"error": "无效的正则表达式"}), 400

    # 加载已有标记
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        try:
            marks = json.load(f)
        except json.JSONDecodeError:
            marks = {}

    updated_count = 0

    for filename in os.listdir(DOC_DIR):
        filepath = os.path.join(DOC_DIR, filename)
        ext = os.path.splitext(filename)[1].lower()

        if ext not in ALLOWED_EXTENSIONS:
            continue

        # 文件名正则匹配
        if regex and not regex.search(filename):
            continue

        # 内容长度匹配
        try:
            if ext == '.txt':
                with open(filepath, 'r', encoding='utf-8') as ftxt:
                    content = ftxt.read()
                if not (min_length <= len(content) <= max_length):
                    continue
            elif ext == '.pdf':
                # 获取 PDF 页数并进行筛选
                with open(filepath, 'rb') as fpdf:
                    pdf_reader = PyPDF2.PdfReader(fpdf)
                    num_pages = len(pdf_reader.pages)
                if not (min_length <= num_pages <= max_length):
                    continue
        except Exception as e:
            print(f"读取文件失败：{filename}", e)
            continue

        # 更新标记
        marks[filename] = mark_color
        updated_count += 1
        print(f"标记：{filename} => {mark_color}")

    # 更新 marks.json
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(marks, f, ensure_ascii=False, indent=2)

    return jsonify({"updatedCount": updated_count})

if __name__ == '__main__':
    app.run(debug=True)
