let marks = {};
let fileList = [];
let currentIndex = -1;
let keyBindings = {
    markA: 'ArrowLeft',
    markB: 'ArrowRight',
    prev: 'ArrowUp',
    next: 'ArrowDown'
};

// 拖动宽度调整
const resizeBar = document.querySelector('.resize-bar');
let isResizing = false;
let sidebar = document.querySelector('.sidebar');
let viewer = document.querySelector('.viewer');

resizeBar.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', () => {
        isResizing = false;
        document.removeEventListener('mousemove', handleMouseMove);
    });
});

function handleMouseMove(e) {
    if (!isResizing) return;
    const newWidth = e.clientX;
    sidebar.style.width = `${newWidth}px`;
    viewer.style.width = `${document.body.clientWidth - newWidth - 10}px`;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    loadFiles();

    document.getElementById('prevBtn').addEventListener('click', () => goTo(-1));
    document.getElementById('nextBtn').addEventListener('click', () => goTo(1));

    // 导出按钮事件
    const exportBtn = document.getElementById('exportBtn');
    const exportDialog = document.getElementById('exportDialog');
    const confirmExport = document.getElementById('confirmExport');
    const cancelExport = document.getElementById('cancelExport');

    exportBtn.onclick = () => {
        exportDialog.classList.remove('hidden');
    };
    cancelExport.onclick = () => {
        exportDialog.classList.add('hidden');
    };
    confirmExport.onclick = () => {
        const checked = Array.from(exportDialog.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        fetch('/api/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ colors: checked })
        })
        .then(res => res.json())
        .then(data => {
            alert(`导出完成，共导出 ${data.exported.length} 个文件。\n文件保存在 exports/`);
            exportDialog.classList.add('hidden');
            loadFiles(); // 刷新目录
        });
    };

    // 筛选按钮事件
    const filterBtn = document.getElementById('filterBtn');
    const filterDialog = document.getElementById('filterDialog');
    const applyFilter = document.getElementById('applyFilter');
    const cancelFilter = document.getElementById('cancelFilter');

    filterBtn.onclick = () => {
        filterDialog.classList.remove('hidden');
    };
    cancelFilter.onclick = () => {
        filterDialog.classList.add('hidden');
    };
    applyFilter.onclick = () => {
        const filenamePattern = document.getElementById('filenamePattern').value;
        const contentPattern = document.getElementById('contentPattern').value;
        const minLength = document.getElementById('minLength').value || 0;  // 默认值 0
        const maxLength = document.getElementById('maxLength').value || 10000000;  // 默认上限
        const mark = document.getElementById('markSelection').value;  // 筛选后要应用的标记颜色
    
        fetch('/api/filter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileNameRegex: filenamePattern,
                contentPattern: contentPattern,
                minLength: minLength,
                maxLength: maxLength,
                markColor: mark  // 将标记颜色传给后端
            })
        })
        .then(res => res.json())
        .then(data => {
            alert(`筛选并打标完成，共标记 ${data.updatedCount} 个文件。`);
            filterDialog.classList.add('hidden');
            loadFiles();  // 刷新文件列表，显示更新后的标记
        });
    };    
});

// 快捷键处理
document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        const filename = document.getElementById('fileContent').dataset.filename;
        if (filename && marks[filename]) {
            saveMark(filename, marks[filename]);
        }
        return;
    }

    switch (e.key) {
        case keyBindings.markA:
            e.preventDefault();
            markAndNext('A');
            break;
        case keyBindings.markB:
            e.preventDefault();
            markAndNext('B');
            break;
        case keyBindings.prev:
            e.preventDefault();
            goTo(-1);
            break;
        case keyBindings.next:
            e.preventDefault();
            goTo(1);
            break;
    }
});

// 加载文件列表并高亮当前项
function loadFiles() {
    fetch('/api/files')
        .then(res => res.json())
        .then(data => {
            fileList = data.files;
            marks = data.marks || {};

            const fileListDiv = document.getElementById('fileList');
            fileListDiv.innerHTML = '';

            fileList.forEach((filename, index) => {
                const item = document.createElement('div');
                item.className = 'file-item';
                if (marks[filename]) item.classList.add('mark-' + marks[filename]);
                if (index === currentIndex) item.classList.add('active');
                item.textContent = filename;
                item.onclick = () => {
                    currentIndex = index;
                    loadFile(filename);
                };
                fileListDiv.appendChild(item);
            });

            if (currentIndex !== -1) {
                const currentItem = document.querySelector('.file-item.active');
                if (currentItem) {
                    currentItem.scrollIntoView({ block: "center", behavior: "smooth" });
                }
            }

            // 自动打开第一项
            if (currentIndex === -1 && fileList.length > 0) {
                currentIndex = 0;
                loadFile(fileList[0]);
            }
        });
}


// 加载单个文件内容
function loadFile(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const viewer = document.getElementById('fileContent');
    if (ext === 'txt') {
        fetch('/api/file/' + filename)
            .then(res => res.text())
            .then(text => {
                viewer.innerText = text;
                viewer.dataset.filename = filename;
            });
    } else if (ext === 'pdf') {
        viewer.innerHTML = `<iframe src="/api/file/${filename}" width="100%" height="100%" frameborder="0"></iframe>`;
        viewer.dataset.filename = filename;
    }

    loadFiles(); // 刷新高亮
}

// 跳转至前/后一个文档
function goTo(offset) {
    const newIndex = currentIndex + offset;
    if (newIndex >= 0 && newIndex < fileList.length) {
        currentIndex = newIndex;
        loadFile(fileList[currentIndex]);
    }
}

// 保存标记
function saveMark(filename, mark) {
    fetch('/api/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, mark })
    }).then(() => {
        marks[filename] = mark;
        loadFiles(); // 刷新标记色
    });
}

// 标记当前文档并跳转下一篇
function markAndNext(mark) {
    const filename = document.getElementById('fileContent').dataset.filename;
    if (!filename) return;
    saveMark(filename, mark);
    currentIndex += 1;
    if (currentIndex < fileList.length) {
        loadFile(fileList[currentIndex]);
    } else {
        currentIndex = -1;
        alert("已到最后一篇文档。");
    }
}
