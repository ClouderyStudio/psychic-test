/* ============================================================
   心灵驿站 - 公共答题引擎
   所有量表页面共享的 JS 逻辑：Toast、进度条、选项渲染、
   答案管理、提交/重测等
   ============================================================ */

/**
 * ScaleEngine - 量表答题引擎
 *
 * 用法：
 *   1. 在页面中定义 questions 数组和 options 数组
 *   2. 创建 ScaleEngine 实例，传入配置
 *   3. 调用 engine.init() 启动
 *
 * @param {Object} config - 配置对象
 * @param {Array}  config.questions - 题目数组 [{ id, text, reversed? }]
 * @param {Array}  config.options   - 选项数组 [{ value/label/short/desc/scoreForward }]
 * @param {string} config.storageKey - localStorage 存储键名
 * @param {string} config.scaleName  - 量表名称（用于 console.log）
 * @param {Object} [config.custom]   - 自定义配置
 * @param {Function} [config.onRender] - 每次渲染后的回调
 * @param {Function} [config.onSubmit] - 提交时的回调，接收 (engine) 参数
 * @param {Function} [config.onRetake] - 重测时的回调
 * @param {Function} [config.getRealScore] - 自定义计分函数 (question, selectedValue) => score
 * @param {boolean} [config.useValueAsScore] - 是否直接用选项的 value 作为分数（如 PHQ-9/GAD-7）
 * @param {boolean} [config.showReverseBadge] - 是否显示反向计分标签
 */
function ScaleEngine(config) {
    var self = this;

    // ==================== 配置 ====================
    self.questions = config.questions;
    self.options = config.options;
    self.storageKey = config.storageKey;
    self.scaleName = config.scaleName || '量表';
    self.custom = config.custom || {};
    self.onRender = config.onRender || null;
    self.onSubmit = config.onSubmit || null;
    self.onRetake = config.onRetake || null;
    self.getRealScore = config.getRealScore || null;
    self.useValueAsScore = !!config.useValueAsScore;
    self.showReverseBadge = config.showReverseBadge !== false;

    // ==================== 状态 ====================
    self.answers = {}; // { questionId: selectedValue }

    // 从 localStorage 恢复
    var saved = localStorage.getItem(self.storageKey);
    if (saved) {
        try {
            var parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object') self.answers = parsed;
        } catch (e) {
            self.answers = {};
        }
    }

    // ==================== DOM 引用 ====================
    self.questionsCard = document.getElementById('questionsCard');
    self.progressBar = document.getElementById('progressBar');
    self.answeredCountEl = document.getElementById('answeredCount');
    self.btnSubmit = document.getElementById('btnSubmit');
    self.btnClear = document.getElementById('btnClear');
    self.navButtons = document.getElementById('navButtons');
    self.resultsSection = document.getElementById('resultsSection');
    self.resultSummary = document.getElementById('resultSummary');
    self.resultLevelContainer = document.getElementById('resultLevelContainer');
    self.resultDate = document.getElementById('resultDate');
    self.crisisAlertContainer = document.getElementById('crisisAlertContainer');
    self.btnRetake = document.getElementById('btnRetake');
    self.toast = document.getElementById('toast');
    self.progressSection = document.getElementById('progressSection');

    self._toastTimer = null;

    // ==================== Toast ====================
    self.showToast = function(msg) {
        clearTimeout(self._toastTimer);
        self.toast.textContent = msg;
        self.toast.classList.add('show');
        self._toastTimer = setTimeout(function() {
            self.toast.classList.remove('show');
        }, 2000);
    };

    // ==================== 保存 ====================
    self.saveAnswers = function() {
        localStorage.setItem(self.storageKey, JSON.stringify(self.answers));
    };

    // ==================== 获取实际分数 ====================
    self.getScore = function(q, selectedValue) {
        if (self.getRealScore) {
            return self.getRealScore(q, selectedValue);
        }
        if (self.useValueAsScore) {
            return selectedValue;
        }
        // 默认：正向计分，如果 reversed 则反向
        if (q.reversed) {
            return 5 - selectedValue;
        }
        return selectedValue;
    };

    // ==================== 渲染题目 ====================
    self.renderQuestions = function() {
        var html = '';
        var len = self.questions.length;
        for (var i = 0; i < len; i++) {
            var q = self.questions[i];
            var selected = self.answers[q.id];
            var isAnswered = selected !== undefined;
            var answeredClass = isAnswered ? ' answered' : '';

            html += '<div class="question-item' + answeredClass + '">';
            html += '<span class="question-num">' + q.id + '</span>';
            html += '<span class="question-text">' + q.text;

            // 反向计分标签
            if (self.showReverseBadge && q.reversed) {
                html += '<span class="reverse-badge">反向</span>';
            }

            html += '</span>';
            html += '<div class="options-row">';

            var optLen = self.options.length;
            for (var j = 0; j < optLen; j++) {
                var opt = self.options[j];
                var optValue = self.useValueAsScore ? opt.value : opt.scoreForward;
                var selClass = (isAnswered && selected === optValue) ? ' selected' : '';
                var label = opt.short || opt.label;
                var desc = opt.desc || opt.label;

                html += '<button class="option-btn' + selClass + '"';
                html += ' data-score="' + optValue + '"';
                html += ' data-qid="' + q.id + '"';
                html += ' aria-label="' + opt.label + '"';
                html += ' title="' + opt.label + '">';
                html += label;
                html += '<span class="option-desc">' + desc + '</span>';
                html += '</button>';
            }

            html += '</div></div>';
        }

        self.questionsCard.innerHTML = html;

        // 绑定选项点击事件
        var btns = self.questionsCard.querySelectorAll('.option-btn');
        var btnLen = btns.length;
        for (var k = 0; k < btnLen; k++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var qid = parseInt(this.getAttribute('data-qid'));
                    var score = parseInt(this.getAttribute('data-score'));
                    if (self.answers[qid] === score) {
                        delete self.answers[qid];
                    } else {
                        self.answers[qid] = score;
                    }
                    self.saveAnswers();
                    self.renderQuestions();
                    self.updateProgress();
                });
            })(btns[k]);
        }

        self.updateProgress();

        // 自定义回调
        if (self.onRender) {
            self.onRender(self);
        }
    };

    // ==================== 更新进度 ====================
    self.updateProgress = function() {
        var total = self.questions.length;
        var answered = Object.keys(self.answers).length;
        var pct = Math.round((answered / total) * 100);
        self.progressBar.style.width = pct + '%';
        self.answeredCountEl.textContent = '已答 ' + answered + ' 题';
        self.btnSubmit.disabled = answered < total;
    };

    // ==================== 清空全部 ====================
    self.clearAll = function() {
        if (Object.keys(self.answers).length === 0) {
            self.showToast('暂无已选答案');
            return;
        }
        if (confirm('确定要清空全部已选答案吗？此操作不可恢复。')) {
            self.answers = {};
            self.saveAnswers();
            self.renderQuestions();
            self.updateProgress();
            self.showToast('已清空全部答案');
        }
    };

    // ==================== 提交 ====================
    self.submitAndShow = function() {
        var total = self.questions.length;
        var answered = Object.keys(self.answers).length;
        if (answered < total) {
            self.showToast('还有 ' + (total - answered) + ' 题未回答，请完成全部题目');
            return;
        }

        // 调用自定义提交逻辑
        if (self.onSubmit) {
            self.onSubmit(self);
        }
    };

    // ==================== 锁定答题区 ====================
    self.lockAnswerArea = function() {
        self.progressSection.style.opacity = '0.5';
        self.questionsCard.style.opacity = '0.5';
        self.navButtons.style.opacity = '0.5';
        self.questionsCard.style.pointerEvents = 'none';
        self.navButtons.style.pointerEvents = 'none';
    };

    // ==================== 解锁答题区 ====================
    self.unlockAnswerArea = function() {
        self.progressSection.style.opacity = '1';
        self.questionsCard.style.opacity = '1';
        self.navButtons.style.opacity = '1';
        self.questionsCard.style.pointerEvents = 'auto';
        self.navButtons.style.pointerEvents = 'auto';
    };

    // ==================== 显示结果 ====================
    self.showResults = function() {
        self.resultsSection.classList.add('visible');
        self.resultDate.textContent = '测评时间：' + new Date().toLocaleString('zh-CN');
        self.saveAnswers();
        self.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.scrollBy(0, -60);
    };

    // ==================== 重新测评 ====================
    self.retakeTest = function() {
        if (confirm('确定要清除所有答案并重新测评吗？')) {
            self.answers = {};
            localStorage.removeItem(self.storageKey);
            self.resultsSection.classList.remove('visible');
            self.crisisAlertContainer.innerHTML = '';
            self.resultLevelContainer.innerHTML = '';
            self.unlockAnswerArea();
            self.renderQuestions();
            self.updateProgress();
            window.scrollTo({ top: 0, behavior: 'smooth' });

            if (self.onRetake) {
                self.onRetake(self);
            }
        }
    };

    // ==================== 初始化 ====================
    self.init = function() {
        // 绑定事件
        if (self.btnClear) {
            self.btnClear.addEventListener('click', function() { self.clearAll(); });
        }
        if (self.btnSubmit) {
            self.btnSubmit.addEventListener('click', function() { self.submitAndShow(); });
        }
        if (self.btnRetake) {
            self.btnRetake.addEventListener('click', function() { self.retakeTest(); });
        }

        // 初始渲染
        self.renderQuestions();
        self.updateProgress();

        console.log('🧠 ' + self.scaleName + ' 已就绪 · ' + self.questions.length + '题');
    };
}
