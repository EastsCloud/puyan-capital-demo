#!/usr/bin/env python3
"""Build the Isater v1.1 three-scenario workflow handbook."""

from __future__ import annotations

from pathlib import Path

from reportlab.graphics.charts.barcharts import HorizontalBarChart
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output/pdf/Isater_Three_Scenario_Full_Workflow_and_Business_Logic_v1.1_20260805.pdf"

INK = HexColor("#07130A")
GREEN = HexColor("#00C805")
GREEN_DARK = HexColor("#008A03")
GREEN_SOFT = HexColor("#E9FBE9")
GREEN_PALE = HexColor("#F4FFF4")
GRAY_900 = HexColor("#242925")
GRAY_700 = HexColor("#5E665F")
GRAY_500 = HexColor("#8A918B")
GRAY_300 = HexColor("#D9DED9")
GRAY_100 = HexColor("#F4F6F3")
WHITE = colors.white
RED = HexColor("#D82C20")
RED_SOFT = HexColor("#FFF0EE")
AMBER = HexColor("#B36A00")
AMBER_SOFT = HexColor("#FFF7E8")
BLUE = HexColor("#2563EB")
BLUE_SOFT = HexColor("#EEF4FF")


def register_fonts() -> tuple[str, str]:
    try:
        pdfmetrics.registerFont(TTFont("IsaterCN", "/System/Library/Fonts/STHeiti Light.ttc", subfontIndex=0))
        pdfmetrics.registerFont(TTFont("IsaterCNBold", "/System/Library/Fonts/STHeiti Medium.ttc", subfontIndex=0))
        return "IsaterCN", "IsaterCNBold"
    except Exception:
        pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
        return "STSong-Light", "STSong-Light"


FONT, FONT_BOLD = register_fonts()
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CNBody", fontName=FONT, fontSize=9.2, leading=14.6,
    textColor=GRAY_900, spaceAfter=4, wordWrap="CJK",
))
styles.add(ParagraphStyle(
    name="CNSmall", fontName=FONT, fontSize=7.5, leading=11.2,
    textColor=GRAY_700, wordWrap="CJK",
))
styles.add(ParagraphStyle(
    name="CNMicro", fontName=FONT, fontSize=6.4, leading=8.6,
    textColor=GRAY_700, wordWrap="CJK",
))
styles.add(ParagraphStyle(
    name="CNTitle", fontName=FONT_BOLD, fontSize=22, leading=29,
    textColor=INK, spaceAfter=7, wordWrap="CJK",
))
styles.add(ParagraphStyle(
    name="CNSection", fontName=FONT_BOLD, fontSize=15.5, leading=22,
    textColor=INK, spaceAfter=5, wordWrap="CJK",
))
styles.add(ParagraphStyle(
    name="CNSub", fontName=FONT_BOLD, fontSize=11, leading=16,
    textColor=INK, spaceBefore=6, spaceAfter=4, wordWrap="CJK",
))
styles.add(ParagraphStyle(
    name="CNMetric", fontName=FONT_BOLD, fontSize=16, leading=19,
    textColor=INK,
))
styles.add(ParagraphStyle(
    name="CNMetricLabel", fontName=FONT, fontSize=7.3, leading=9.5,
    textColor=GRAY_700,
))
styles.add(ParagraphStyle(
    name="CNWhiteTitle", fontName=FONT_BOLD, fontSize=25, leading=33,
    textColor=WHITE, wordWrap="CJK",
))
styles.add(ParagraphStyle(
    name="CNWhite", fontName=FONT, fontSize=10, leading=16,
    textColor=WHITE, wordWrap="CJK",
))
styles.add(ParagraphStyle(
    name="CNTable", fontName=FONT, fontSize=7.1, leading=9.7,
    textColor=GRAY_900, wordWrap="CJK",
))
styles.add(ParagraphStyle(
    name="CNTableHead", fontName=FONT_BOLD, fontSize=7.1, leading=9.7,
    textColor=INK, wordWrap="CJK",
))
styles.add(ParagraphStyle(
    name="CNNote", fontName=FONT, fontSize=8.1, leading=12.2,
    textColor=GRAY_900, wordWrap="CJK",
))
styles.add(ParagraphStyle(
    name="CNCenter", fontName=FONT_BOLD, fontSize=8, leading=11,
    textColor=INK, alignment=TA_CENTER, wordWrap="CJK",
))


def P(text, style="CNBody"):
    return Paragraph(str(text), styles[style])


def pct(value, digits=1):
    return f"{float(value) * 100:.{digits}f}%"


def money(value):
    return f"USD {float(value):,.0f}"


def note(text, tone="green"):
    fill, stroke = {
        "green": (GREEN_SOFT, GREEN),
        "gray": (GRAY_100, GRAY_300),
        "amber": (AMBER_SOFT, AMBER),
        "red": (RED_SOFT, RED),
        "blue": (BLUE_SOFT, BLUE),
    }[tone]
    t = Table([[P(text, "CNNote")]], colWidths=[174 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fill),
        ("BOX", (0, 0), (-1, -1), 0.8, stroke),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return t


def bullet(text, color=GREEN_DARK):
    t = Table([[P("●", "CNSmall"), P(text, "CNBody")]], colWidths=[5 * mm, 169 * mm])
    t.setStyle(TableStyle([
        ("TEXTCOLOR", (0, 0), (0, 0), color),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    return t


def data_table(headers, rows, widths):
    content = [[P(cell, "CNTableHead") for cell in headers]]
    content.extend([[P(cell, "CNTable") for cell in row] for row in rows])
    t = Table(content, colWidths=widths, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), GREEN_SOFT),
        ("BOX", (0, 0), (-1, -1), 0.7, GRAY_300),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, GRAY_300),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, GRAY_100]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def metric_cards(cards, columns=3):
    width = 174 * mm / columns
    rows = []
    for start in range(0, len(cards), columns):
        group = cards[start:start + columns]
        while len(group) < columns:
            group.append(("", "", ""))
        rows.append([
            Table([[P(value, "CNMetric")], [P(label, "CNMetricLabel")], [P(hint, "CNMicro")]],
                  colWidths=[width - 8 * mm])
            for label, value, hint in group
        ])
    t = Table(rows, colWidths=[width] * columns)
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.7, GRAY_300),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, GRAY_300),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return t


def workflow_diagram():
    d = Drawing(500, 205)
    boxes = [
        ("01", "公开数据", "委员会"), ("02", "年度目标", "委员会"),
        ("03", "Sleeve 约束", "系统/执行"), ("04", "拟组合", "执行小组"),
        ("05", "回测优化", "执行小组"), ("06", "组合审批", "委员会"),
        ("07", "交易复核", "执行双人"), ("08", "监控再平衡", "执行小组"),
        ("09", "非股票净值", "执行/委员会"), ("10", "报告归因", "系统/委员会"),
    ]
    for i, (num, title, role) in enumerate(boxes):
        row = 0 if i < 5 else 1
        col = i if i < 5 else 9 - i
        x = 4 + col * 99
        y = 118 if row == 0 else 28
        d.add(Rect(x, y, 88, 52, rx=3, ry=3, fillColor=GREEN_PALE, strokeColor=GREEN, strokeWidth=1))
        d.add(String(x + 8, y + 37, num, fontName=FONT_BOLD, fontSize=8, fillColor=GREEN_DARK))
        d.add(String(x + 8, y + 23, title, fontName=FONT_BOLD, fontSize=8, fillColor=INK))
        d.add(String(x + 8, y + 10, role, fontName=FONT, fontSize=6.5, fillColor=GRAY_700))
        if i < 4:
            d.add(String(x + 91, y + 23, "→", fontName=FONT_BOLD, fontSize=12, fillColor=GREEN_DARK))
        if 5 <= i < 9:
            d.add(String(x - 10, y + 23, "←", fontName=FONT_BOLD, fontSize=12, fillColor=GREEN_DARK))
    d.add(String(475, 93, "↓", fontName=FONT_BOLD, fontSize=14, fillColor=GREEN_DARK))
    return d


def allocation_chart():
    d = Drawing(500, 190)
    c = HorizontalBarChart()
    c.x, c.y, c.width, c.height = 90, 30, 380, 120
    c.data = [
        [45, 35, 20],
        [40, 35, 60],
        [10, 25, 5],
        [5, 5, 15],
    ]
    c.categoryAxis.categoryNames = ["牛市", "平衡市", "熊市"]
    c.categoryAxis.labels.fontName = FONT
    c.categoryAxis.labels.fontSize = 7
    c.valueAxis.labels.fontName = FONT
    c.valueAxis.labels.fontSize = 7
    c.valueAxis.valueMin = 0
    c.valueAxis.valueMax = 100
    c.valueAxis.valueStep = 20
    c.barLabels.nudge = 5
    c.bars[0].fillColor = GREEN
    c.bars[1].fillColor = BLUE
    c.bars[2].fillColor = AMBER
    c.bars[3].fillColor = GRAY_500
    d.add(c)
    d.add(String(90, 168, "股票", fontName=FONT, fontSize=7, fillColor=GREEN_DARK))
    d.add(String(135, 168, "债券", fontName=FONT, fontSize=7, fillColor=BLUE))
    d.add(String(180, 168, "另类", fontName=FONT, fontSize=7, fillColor=AMBER))
    d.add(String(225, 168, "现金", fontName=FONT, fontSize=7, fillColor=GRAY_700))
    return d


class IsaterDoc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(
            filename, pagesize=A4,
            leftMargin=18 * mm, rightMargin=18 * mm,
            topMargin=18 * mm, bottomMargin=16 * mm,
            title="Isater 三情景全流程真实数据与业务逻辑说明",
            author="Puyan Capital",
            subject="Isater v1.1 three-scenario workflow, controls and verified examples",
        )
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="content")
        self.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=self.draw_page)])

    def draw_page(self, canvas, doc):
        page = canvas.getPageNumber()
        if page == 1:
            return
        canvas.saveState()
        canvas.setStrokeColor(GRAY_300)
        canvas.line(18 * mm, A4[1] - 13 * mm, A4[0] - 18 * mm, A4[1] - 13 * mm)
        canvas.setFont(FONT_BOLD, 7.3)
        canvas.setFillColor(INK)
        canvas.drawString(18 * mm, A4[1] - 10 * mm, "ISATER / THREE-SCENARIO WORKFLOW HANDBOOK")
        canvas.setFont(FONT, 7)
        canvas.setFillColor(GRAY_700)
        canvas.drawRightString(A4[0] - 18 * mm, A4[1] - 10 * mm, "Puyan Capital · Internal")
        canvas.line(18 * mm, 11 * mm, A4[0] - 18 * mm, 11 * mm)
        canvas.drawString(18 * mm, 7 * mm, "数据截点：2026-08-05 | 文档版本 1.1")
        canvas.drawRightString(A4[0] - 18 * mm, 7 * mm, f"{page:02d}")
        canvas.restoreState()


story = []


def new_page(number, title, subtitle=None):
    if story:
        story.append(PageBreak())
    story.append(P(f"{number}  {title}", "CNSection"))
    if subtitle:
        story.append(P(subtitle, "CNSmall"))
    story.append(Spacer(1, 3 * mm))


# Cover
cover = Table([
    [P("ISATER", "CNWhiteTitle")],
    [P("三种情景全流程真实数据与业务逻辑说明", "CNWhiteTitle")],
    [Spacer(1, 10 * mm)],
    [P("牛市、平衡市、熊市：从公开数据、目标拆解、Sleeve 约束、拟组合、回测优化，到审批、交易、监控与报告", "CNWhite")],
    [Spacer(1, 29 * mm)],
    [P("验证组合：Puyan Capital Proprietary Portfolio", "CNWhite")],
    [P("基础币种 USD · 初始本金 USD 10,000,000 · 2026 年度流程", "CNWhite")],
    [Spacer(1, 16 * mm)],
    [P("文档版本 1.1 | 2026-08-05 | 内部使用", "CNWhite")],
], colWidths=[174 * mm])
cover.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), INK),
    ("LEFTPADDING", (0, 0), (-1, -1), 15 * mm),
    ("RIGHTPADDING", (0, 0), (-1, -1), 15 * mm),
    ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
]))
story.append(Spacer(1, 8 * mm))
story.append(cover)


new_page("00", "文档边界与结论", "本版替换修复前 PDF；数字来自三次独立真实点击测试和已验证报告记录。")
story.append(metric_cards([
    ("正式情景", "3 个", "牛市、平衡市、熊市"),
    ("独立数据库", "3 组", "不复用旧流程状态"),
    ("业务账户", "4 类", "管理员、委员会、两名执行人员"),
]))
story.append(Spacer(1, 5 * mm))
story.append(note("三种情景都已用页面可见按钮真实运行。牛市直接通过；平衡市和熊市在新兴市场触发优化后通过。三种情景均推进到监控交接；熊市另有完整的持仓、再平衡、净值审批和报告发布验证。", "green"))
story.append(Spacer(1, 5 * mm))
story.append(P("本版已经关闭旧 PDF 的三项问题", "CNSub"))
story.append(bullet("熊市债券收益不再加入未经批准的久期价格调整，改用 10 年期美债收益率作为 12 个月 carry 代理。"))
story.append(bullet("优化器逐 Sleeve 独立求解，先调原 Ticker 权重，无解时才按最少更换 1 只、2 只继续搜索。"))
story.append(bullet("管理员页面只维护年度引擎真实使用的参数，并保存参数版本、生效时间和完整政策快照。"))


new_page("01", "端到端流程图", "每一步都有明确责任人、系统动作和审批边界。")
story.append(workflow_diagram())
story.append(Spacer(1, 4 * mm))
story.append(note("公开数据和年度目标由决策委员会负责；组合构建、回测、优化和交易由执行小组负责；组合与非股票净值回到委员会批准。委员会可以只读查看执行环节，但不能替执行小组操作。", "gray"))


new_page("02", "角色、操作与批准", "系统不是教学页面：前端只显示当前角色需要执行或复核的动作。")
story.append(data_table(
    ["阶段", "执行者", "系统动作", "批准/复核"],
    [
        ["系统准备", "系统管理员", "创建账户、参数生效、数据凭据", "管理员本人"],
        ["本金与年度数据", "决策委员会", "本金生效、选情景、运行公开数据", "委员会表决"],
        ["年度目标", "决策委员会", "在情景区间内设目标收益率", "委员会表决"],
        ["Sleeve 与组合", "执行小组", "确认约束、系统内选 Ticker 和权重", "组合完成后提交委员会"],
        ["回测与优化", "执行小组", "逐 Sleeve 回测并选择系统方案", "委员会只读，不能代操作"],
        ["组合审批", "决策委员会", "审阅组合、回测和优化证据", "2/3 表决；当前可一人"],
        ["交易实施", "执行人员 1", "提交标准化交易计划", "执行人员 2 独立复核"],
        ["监控与报告", "执行/委员会", "每日持仓、月检、净值和报告", "非股票净值由委员会批准"],
    ],
    [31 * mm, 35 * mm, 70 * mm, 38 * mm],
))


new_page("03", "为什么第一步是公开数据引擎", "它为全年所有计算建立同一数据截点和可追溯的数据血缘。")
story.append(metric_cards([
    ("数据截点", "2026-06-01", "三情景共同基线"),
    ("逻辑来源", "8 组", "股票、利率、通胀、商品"),
    ("运行方式", "一键", "委员会点击并审阅结果"),
]))
story.append(Spacer(1, 5 * mm))
story.append(data_table(
    ["数据类别", "示例来源/序列", "用于哪里"],
    [
        ["全球及区域股票", "S&P 500、Nikkei 225、上证、恒生", "情景识别、市场收益、波动、回撤"],
        ["无风险利率", "美国、日本、中国、香港当地利率", "各 Sleeve CAPM；不能统一使用一个利率"],
        ["债券与现金", "10 年期美债 4.75%、3 月期国库券 3.73%", "未来 12 个月 carry 代理"],
        ["通胀", "美国 CPI 3.5%", "年度经济底线"],
        ["另类资产", "公开商品/替代资产序列", "情景收益和配置建议"],
        ["Ticker 与 benchmark", "个股价格及同市场指数", "个股 beta、组合回测和归因"],
    ],
    [38 * mm, 70 * mm, 66 * mm],
))
story.append(Spacer(1, 4 * mm))
story.append(note("账号和密码只保存在服务端加密配置中。前端只能录入、测试连接和查看脱敏状态，不能读取明文。", "blue"))


new_page("04", "从历史情景到配置比例", "系统根据历史同类月份优化，不是把牛、平衡、熊直接写死成固定比例。")
story.append(data_table(
    ["情景", "历史判定", "本次样本", "风险厌恶", "股票允许范围"],
    [
        ["牛市", "全球股票 12 个月动量 >= +5%", "114 个月", "0.20", "45%-80%"],
        ["平衡市", "-3% < 动量 < +5%", "46 个月", "0.45", "35%-65%"],
        ["熊市", "12 个月动量 <= -3%", "72 个月", "0.80", "20%-50%"],
    ],
    [31 * mm, 58 * mm, 28 * mm, 27 * mm, 30 * mm],
))
story.append(Spacer(1, 5 * mm))
story.append(note("每个情景内，系统在管理员维护的 5% 权重网格和资产上下限中，选择“预期收益 - 风险厌恶 × 波动 - 集中度惩罚”最高的组合。风险厌恶越高，越重视降低风险。", "gray"))
story.append(Spacer(1, 5 * mm))
story.append(allocation_chart())


new_page("05", "三种情景的配置结果", "这是三次独立点击公开数据引擎后页面实际显示的建议。")
story.append(data_table(
    ["情景", "股票", "债券", "另类", "现金", "美/日/新兴", "预期收益", "波动"],
    [
        ["牛市", "45%", "40%", "10%", "5%", "35% / 25% / 40%", "3.4%", "7.0%"],
        ["平衡市", "35%", "35%", "25%", "5%", "70% / 15% / 15%", "6.8%", "5.9%"],
        ["熊市", "20%", "60%", "5%", "15%", "45% / 10% / 45%", "4.5%", "3.8%"],
    ],
    [24 * mm, 18 * mm, 18 * mm, 18 * mm, 18 * mm, 42 * mm, 20 * mm, 16 * mm],
))
story.append(Spacer(1, 6 * mm))
story.append(P("如何理解这些结果", "CNSub"))
story.append(bullet("牛市的股票仍为 45%，因为当前样本和风险惩罚使最优结果落在股票下限；这不是系统把牛市固定成高股票。"))
story.append(bullet("平衡市的美股占股票 70%，因此 USD 10m 本金对应美股预算 USD 2.45m。"))
story.append(bullet("熊市把债券提高到 60%，以 4.75% carry 计算后，债券贡献已经足以支持年度经济底线。"))


new_page("06", "年度目标收益率如何产生", "目标是最低要求，不是必须精确命中的点；高于目标不会被拉回。")
story.append(note("年度目标建议 = max(公开数据模型预期收益, 运营成本 + 预期 CPI)，再限制在该情景允许区间内。委员会可以在允许范围内重新选择并提交表决。", "green"))
story.append(Spacer(1, 5 * mm))
story.append(data_table(
    ["情景", "模型预期", "经济底线", "允许范围", "实际批准目标", "判断口径"],
    [
        ["牛市", "3.4%", "4.5%", "7%-12%", "7.0%", "达到下限即可"],
        ["平衡市", "6.8%", "4.5%", "4%-8%", "6.76%", "达到下限即可"],
        ["熊市", "4.5%", "4.5%", "2%-6%", "4.51%", "达到下限即可"],
    ],
    [25 * mm, 27 * mm, 27 * mm, 29 * mm, 33 * mm, 33 * mm],
))
story.append(Spacer(1, 5 * mm))
story.append(note("收益控制只设下限：回测年化收益 >= 目标收益 × 95%。收益显著较高时系统提示复核个股集中风险，但不会因此判失败。", "gray"))


new_page("07", "从年度目标拆到 Sleeve", "先算债券、现金、另类和股票基准贡献；只有组合基准不足时才产生股票需填补收益。")
story.append(data_table(
    ["步骤", "计算", "业务含义"],
    [
        ["1", "每类贡献 = 大类/市场权重 × 参考收益率", "先看按公开市场假设能获得多少"],
        ["2", "组合基准收益 = 全部贡献之和", "债券、现金和另类不能被忽略"],
        ["3", "差额 = max(0, 年度目标 - 组合基准收益)", "目标已经满足时差额必须为 0"],
        ["4", "如有差额，按股票市场政策权重分配", "不制造负股票收益，也不把高收益向下硬拉"],
        ["5", "形成三个 Sleeve 的收益、Beta 和回撤目标", "后续逐 Sleeve 回测和优化"],
    ],
    [18 * mm, 80 * mm, 76 * mm],
))
story.append(Spacer(1, 5 * mm))
story.append(note("熊市旧错误已经修复：债券收益不再使用“carry + 假设 6 年久期价格变化”。当前 10 年期美债 4.75% 直接作为未来 12 个月 carry 代理，熊市组合预期约 4.54%，高于约 4.46% 的经济底线，股票需填补收益为 0。", "green"))


new_page("08", "三情景 Sleeve 目标", "Sleeve 名称不变；美股只含美国，日本属于发达非美，新兴市场只含 A 股和港股。")
story.append(data_table(
    ["情景", "Sleeve", "股票内权重", "目标收益", "目标 Beta", "最大回撤预算"],
    [
        ["牛市", "美股", "35%", "5.4%", "1.81", "-23.8%"],
        ["牛市", "日本", "25%", "11.0%", "1.35", "-28.3%"],
        ["牛市", "新兴", "40%", "12.9%", "1.34", "-50.0%"],
        ["平衡", "美股", "70%", "12.2%", "1.00", "-17.4%"],
        ["平衡", "日本", "15%", "10.4%", "1.00", "-24.3%"],
        ["平衡", "新兴", "15%", "3.1%", "1.00", "-49.5%"],
        ["熊市", "美股", "45%", "7.4%", "1.00", "-49.7%"],
        ["熊市", "日本", "10%", "1.0%", "1.00", "-45.2%"],
        ["熊市", "新兴", "45%", "8.1%", "1.00", "-49.2%"],
    ],
    [23 * mm, 28 * mm, 30 * mm, 29 * mm, 28 * mm, 36 * mm],
))
story.append(Spacer(1, 5 * mm))
story.append(note("旧版第 5 页只突出美股 Beta 和总体权益回撤。本版列出三个 Sleeve 各自的目标收益、目标 Beta 和回撤预算，后续回测也按三行分别核对。", "blue"))


new_page("09", "目标 Beta 与个股 Beta", "两者来源不同，但通过组合权重连接。")
story.append(data_table(
    ["项目", "目标 Beta", "个股 Beta"],
    [
        ["是什么", "Sleeve 需要达到的系统性风险约束", "Ticker 相对同市场 benchmark 的历史敏感度"],
        ["如何得到", "(Sleeve 目标收益 - 当地无风险利率) / (市场收益 - 当地无风险利率)", "36 个月周收益回归"],
        ["无风险利率", "美、日、A 股、港股分别使用当地利率", "不直接进入个股历史回归"],
        ["Benchmark", "与 Sleeve 市场一致", "美股 ^GSPC；日本 ^N225；新兴为 A 股和港股组合"],
        ["进入优化", "作为 Sleeve 约束", "按权重合成为实际 Sleeve Beta"],
    ],
    [31 * mm, 71 * mm, 72 * mm],
))
story.append(Spacer(1, 5 * mm))
story.append(note("实际 Sleeve Beta = Σ(个股在 Sleeve 中的权重 × 个股 Beta)。所以优化器能通过降低高 Beta 股票、提高低 Beta 股票的权重来修复失败；只有权重范围内无解时才换 Ticker。", "green"))


new_page("10", "拟投资组合控制", "执行小组在系统内选股，不从外部导入 proposed portfolio。")
story.append(data_table(
    ["Sleeve", "允许市场", "测试 Ticker", "风格和数量", "单股上限"],
    [
        ["美股", "美国", "AAPL、AMZN、JNJ、JPM", "成长 2 + 价值 2", "35%/Sleeve"],
        ["发达非美", "日本", "6758、6861、7203、8058", "成长 2 + 价值 2", "35%/Sleeve"],
        ["新兴市场", "中国 A 股、香港", "002594、0700、0005、1299", "成长 2 + 价值 2", "35%/Sleeve"],
    ],
    [31 * mm, 36 * mm, 59 * mm, 29 * mm, 19 * mm],
))
story.append(Spacer(1, 5 * mm))
story.append(bullet("每个 Sleeve 的每种风格必须有 2-5 只 Ticker；系统管理员可维护默认范围。"))
story.append(bullet("股票 Sleeve 不能包含现金，否则 Beta 会被现金稀释。"))
story.append(bullet("ETF 可以作为 Ticker，但必须属于美股、日本、A 股或港股的允许市场。"))
story.append(bullet("初始测试组合每只占所在 Sleeve 的 25%，因此数量、风格和单股上限全部通过。"))


new_page("11", "回测规则", "只测 proposed portfolio 的股票部分，并逐 Sleeve 使用同市场 benchmark。")
story.append(metric_cards([
    ("窗口", "36 个月", "页面明确选择"),
    ("频率", "周频", "减少日频噪声"),
    ("单位", "逐 Sleeve", "没有整体股票 Beta 目标"),
]))
story.append(Spacer(1, 5 * mm))
story.append(data_table(
    ["控制", "通过规则", "处理方式"],
    [
        ["收益率", "实际年化收益 >= 目标 × 95%", "高于目标不失败；过高时提示检查个股风险"],
        ["Beta", "不得高于目标 × 105%", "低于目标且收益、回撤通过时只提示复核"],
        ["最大回撤", "不得超过适用预算放宽 10% 后的上限", "使用相对比例容差，不是绝对百分点"],
    ],
    [28 * mm, 73 * mm, 73 * mm],
))
story.append(Spacer(1, 5 * mm))
story.append(note("回测的目的不是证明历史一定重复，而是检查拟组合在同一数据窗口下是否符合委员会批准的收益、系统性风险和损失预算。", "gray"))


new_page("12", "牛市真实回测", "三项硬控制均通过，因此系统正确跳过优化。")
story.append(data_table(
    ["Sleeve", "样本", "收益/目标", "Beta/目标", "回撤/预算", "结果"],
    [
        ["美股", "157 周", "26.8% / 5.4%", "0.90 / 1.81", "-18.5% / -23.8%", "通过"],
        ["日本", "157 周", "18.4% / 11.0%", "0.77 / 1.35", "-20.6% / -28.3%", "通过"],
        ["新兴", "154 周", "19.0% / 12.9%", "0.94 / 1.34", "-17.9% / -50.0%", "通过"],
    ],
    [28 * mm, 25 * mm, 36 * mm, 34 * mm, 39 * mm, 12 * mm],
))
story.append(Spacer(1, 6 * mm))
story.append(note("三个实际 Beta 都低于目标，但收益和回撤通过，所以按照当前政策显示为复核提示而不是硬失败。执行小组无需为了追高 Beta 而增加风险。", "green"))
story.append(Spacer(1, 5 * mm))
story.append(metric_cards([
    ("股票预算", money(4_500_000), "本金 × 45%"),
    ("交易指令", "12 笔", "系统自动换算金额"),
    ("流程结果", "进入监控", "委员会批准并双人复核"),
]))


new_page("13", "平衡市首次回测", "美股和日本通过；新兴市场 Beta 轻微超过硬上限。")
story.append(data_table(
    ["Sleeve", "收益/目标", "Beta/目标", "回撤/预算", "硬结论"],
    [
        ["美股", "26.8% / 12.2%", "0.90 / 1.00", "-18.5% / -17.4%", "通过"],
        ["日本", "18.4% / 10.4%", "0.77 / 1.00", "-20.6% / -24.3%", "通过"],
        ["新兴", "19.0% / 3.1%", "1.06 / 1.00", "-17.9% / -49.5%", "失败"],
    ],
    [31 * mm, 39 * mm, 37 * mm, 42 * mm, 25 * mm],
))
story.append(Spacer(1, 6 * mm))
story.append(note("新兴市场 Beta 上限为 1.00 × 105% = 1.05，实际约 1.06，因此只有这一项触发优化。系统没有把三个 Sleeve 混在一起求解。", "red"))


new_page("14", "平衡市三组优化方案", "优化器先保留原 Ticker，只调失败 Sleeve 的内部权重。")
story.append(data_table(
    ["方案", "目标", "Beta", "收益", "回撤", "单边换手", "换 Ticker", "结果"],
    [
        ["1", "最小换手", "1.042", "19.8%", "-17.6%", "2%", "无", "通过"],
        ["2", "Beta 最接近", "1.000", "21.6%", "-16.8%", "7%", "无", "通过"],
        ["3", "回撤缓冲", "1.019", "22.7%", "-14.6%", "13%", "无", "通过"],
    ],
    [15 * mm, 35 * mm, 23 * mm, 23 * mm, 24 * mm, 24 * mm, 24 * mm, 16 * mm],
))
story.append(Spacer(1, 5 * mm))
story.append(P("执行小组实际选择方案 1", "CNSub"))
story.append(data_table(
    ["Ticker", "原权重", "新权重", "变化"],
    [["0005", "25%", "27%", "+2%"], ["1299", "25%", "23%", "-2%"]],
    [43.5 * mm] * 4,
))
story.append(Spacer(1, 5 * mm))
story.append(note("只有失败的新兴市场被调整。方案被接受后，委员会批准，USD 3.5m 股票计划由执行人员 1 提交、执行人员 2 复核，并进入监控。", "green"))


new_page("15", "熊市修复后的年度拆解", "旧版问题不是债券收益不足，而是系统自行加入了错误的久期价格调整。")
story.append(data_table(
    ["项目", "修复前", "修复后", "业务解释"],
    [
        ["债券预期收益", "1.36%", "4.75%", "使用 10 年期美债 carry，不加入假设价格变化"],
        ["现金预期收益", "1.01%", "3.73%", "使用 3 月期国库券 carry"],
        ["组合预期收益", "2.04%", "4.54%", "债券 60%、现金 15% 后足以支持底线"],
        ["经济底线", "4.46%", "4.46%", "运营成本 + CPI，没有改变"],
        ["股票需填补收益", "2.33%", "0.00%", "不再把错误差额压给 20% 股票资产"],
    ],
    [34 * mm, 27 * mm, 27 * mm, 86 * mm],
))
story.append(Spacer(1, 6 * mm))
story.append(note("修复后熊市三个目标 Beta 均为 1.00，CAPM 不再产生 5.07、19.21、3.22 这类不可实现值。", "green"))


new_page("16", "熊市回测与优化", "新兴市场初始 Beta 未通过，分 Sleeve 优化后通过。")
story.append(data_table(
    ["Sleeve", "收益/目标", "Beta/目标", "回撤/预算", "初始结果"],
    [
        ["美股", "26.8% / 7.4%", "0.90 / 1.00", "-18.5% / -49.7%", "通过"],
        ["日本", "18.4% / 1.0%", "0.77 / 1.00", "-20.6% / -45.2%", "通过"],
        ["新兴", "19.0% / 8.1%", "1.08 / 1.00", "-17.9% / -49.2%", "失败"],
    ],
    [31 * mm, 39 * mm, 37 * mm, 42 * mm, 25 * mm],
))
story.append(Spacer(1, 5 * mm))
story.append(data_table(
    ["优化方案", "Beta", "收益", "回撤", "换手", "结果"],
    [
        ["最小换手", "1.049", "20.2%", "-17.4%", "3%", "通过"],
        ["Beta 接近", "1.000", "18.9%", "-19.1%", "17%", "通过"],
        ["回撤缓冲", "1.038", "22.7%", "-14.6%", "13%", "通过"],
    ],
    [40 * mm, 25 * mm, 27 * mm, 30 * mm, 25 * mm, 27 * mm],
))
story.append(Spacer(1, 5 * mm))
story.append(note("执行小组选择最小换手方案：0005 从 25% 调至 28%，1299 从 25% 调至 22%。没有换 Ticker，优化后新兴市场通过。", "green"))


new_page("17", "优化器完整优先级", "先做最小必要改变；三组方案都必须覆盖全部失败 Sleeve。")
story.append(data_table(
    ["优先级", "系统动作", "进入下一层的条件"],
    [
        ["1", "每个失败 Sleeve 独立调原 Ticker 权重", "权重范围内无完整可行解"],
        ["2", "在同 Sleeve、同允许市场和风格中更换 1 只 Ticker", "仍无完整可行解"],
        ["3", "最少更换 2 只 Ticker", "仍无解才继续扩大搜索"],
        ["4", "保持 2-5 只风格数量、35% 单股上限", "任何方案都不能绕过硬约束"],
        ["5", "输出最小换手、Beta 接近、回撤缓冲三套完整方案", "执行小组选择其中一套"],
    ],
    [25 * mm, 87 * mm, 62 * mm],
))
story.append(Spacer(1, 6 * mm))
story.append(note("本次平衡市和熊市都在第 1 层通过，所以没有强行换股。最少换股搜索已经实现，但只有原 Ticker 权重确实无解时才会使用。", "blue"))


new_page("18", "组合审批与交易实施", "投资决策审批和交易内部复核是两种不同控制。")
story.append(data_table(
    ["控制", "提交人", "复核/批准人", "系统限制"],
    [
        ["公开数据", "决策委员会成员", "委员会 2/3", "执行小组不能批准"],
        ["目标收益", "决策委员会成员", "委员会 2/3", "必须在情景范围内"],
        ["拟投资组合", "执行小组", "委员会 2/3", "附回测和优化证据"],
        ["交易计划", "执行人员 1", "执行人员 2", "必须是不同用户"],
        ["非股票净值", "执行小组", "决策委员会", "批准后才能进入报告"],
    ],
    [37 * mm, 43 * mm, 43 * mm, 51 * mm],
))
story.append(Spacer(1, 6 * mm))
story.append(metric_cards([
    ("牛市股票计划", money(4_500_000), "45% 股票"),
    ("平衡市股票计划", money(3_500_000), "35% 股票"),
    ("熊市股票计划", money(2_000_000), "20% 股票"),
]))
story.append(Spacer(1, 5 * mm))
story.append(note("委员会批准的是投资方案；执行小组第二人复核的是标准化交易指令。第二人不能与提交人相同。", "gray"))


new_page("19", "每日持仓与月度再平衡", "每日导入是数据更新；只有月度检查发现越界才触发交易流程。")
story.append(metric_cards([
    ("持仓导入", "每日", "富途格式，未来可扩来源"),
    ("再平衡检查", "按月", "检查日越界才触发"),
    ("完成期限", "3 个交易日", "到期后自动复核"),
]))
story.append(Spacer(1, 5 * mm))
story.append(note("风格 corridor = 目标权重 × (1 - 20%) 至目标权重 × (1 + 20%)。例如目标 35%，允许范围是 28%-42%，不是上下 20 个百分点。", "gray"))
story.append(Spacer(1, 5 * mm))
story.append(data_table(
    ["月检发现", "系统计算", "系统方案", "执行小组动作"],
    [
        ["美股成长超上限", "最少卖出 USD 219,178", "方案 1：最少交易", "接受或申请例外"],
        ["美股价值低于下限", "最少买入 USD 195,122", "方案 2：回到目标", "选择一套并提交"],
        ["第 3 个交易日仍越界", "形成未完成记录", "提醒并升级报告", "说明原因并继续跟踪"],
    ],
    [43 * mm, 50 * mm, 42 * mm, 39 * mm],
))


new_page("20", "报告前的非股票净值", "股票每天统计；债券、另类和现金按报告期录入并由委员会批准。")
story.append(data_table(
    ["资产", "取数方式", "审核", "日期控制"],
    [
        ["股票", "每日持仓 × 市场价格", "系统自动", "形成股票市值曲线"],
        ["债券", "执行小组录入期末净值", "委员会批准", "必须与最新有效股票持仓日一致"],
        ["另类", "执行小组录入期末净值", "委员会批准", "必须与最新有效股票持仓日一致"],
        ["现金", "执行小组录入期末余额", "委员会批准", "必须与最新有效股票持仓日一致"],
    ],
    [28 * mm, 58 * mm, 37 * mm, 51 * mm],
))
story.append(Spacer(1, 6 * mm))
story.append(note("日期一致性已经加固：页面自动采用最新有效股票持仓日并设为只读；后台再次校验，日期不同会拒绝提交。", "green"))


new_page("21", "报告、风险指标与发布", "前端分屏展示，PDF 下载是补充，不取代页面报告。")
story.append(data_table(
    ["报告屏", "主要内容", "业务意义"],
    [
        ["1 净值与目标", "本金、期末净值、净值曲线、收益达标情况", "回答赚了多少、是否达到年度下限"],
        ["2 风险指标", "三个 Sleeve 的 Sharpe、Sortino、回撤", "比较单位风险收益和下行风险"],
        ["3 贡献与归因", "大类贡献、市场、配置、择股、交互", "区分市场环境、委员会配置和执行选股"],
    ],
    [34 * mm, 79 * mm, 61 * mm],
))
story.append(Spacer(1, 6 * mm))
story.append(note("风险指标至少需要 20 个有效持仓日。样本不足时显示不可用，而不是用极短序列制造看似精确的 Sharpe 或 Sortino。", "green"))
story.append(Spacer(1, 4 * mm))
story.append(bullet("熊市完整测试报告：本金 USD 10m，期末净值 USD 10.18m，期间收益 1.80%，年度目标 4.51%。"))
story.append(bullet("大类贡献：债券 1.50%、另类 0.20%、现金 0.10%、股票 0.00%，合计 1.80%。"))
story.append(bullet("报告可在前端查看、下载 PDF、发布，并由委员会只读查看；中英文切换已验证。"))


new_page("22", "业绩归因的实际例子", "归因衡量决策效果，不是给委员会或执行人员打分。")
story.append(data_table(
    ["归因项", "已验证示例", "代表什么"],
    [
        ["市场效应", "+0.910 pp", "如果按 benchmark 配置，市场本身带来的贡献"],
        ["配置效应", "-0.602 pp", "实际市场/资产权重偏离目标产生的效果；对应配置决策职责"],
        ["择股效应", "-0.310 pp", "各 Sleeve 个股相对同市场 benchmark 的效果；对应执行职责"],
        ["交互效应", "+0.001 pp", "权重偏离和相对表现同时发生的交叉项"],
        ["非股票效应", "0.000 pp", "债券、另类和现金在该归因观察期的贡献"],
        ["合计", "约 0.000 pp", "0.910 - 0.602 - 0.310 + 0.001，和组合期内结果对账"],
    ],
    [37 * mm, 31 * mm, 106 * mm],
))
story.append(Spacer(1, 6 * mm))
story.append(note("不能把 -0.602 pp 写成“委员会贡献为负”，也不能把 -0.310 pp 写成“执行小组贡献为负”。正确表述是配置效应和择股效应在该观察期为负，需要结合市场、样本期和基准解释。", "amber"))


new_page("23", "管理员维护参数", "页面只保留真正进入计算和控制的参数，并记录版本与生效时间。")
story.append(data_table(
    ["参数类别", "示例默认值", "使用位置"],
    [
        ["情景校准", "20 年、样本下限、动量阈值、5% 网格", "公开数据与配置建议"],
        ["大类/市场上下限", "各情景资产边界、市场边界", "年度配置优化"],
        ["目标收益区间", "牛 7%-12%、平衡 4%-8%、熊 2%-6%", "委员会目标录入"],
        ["当地无风险利率", "美、日、中、港分别维护", "Sleeve CAPM"],
        ["回测容差", "收益下浮 5%、Beta 上浮 5%、回撤 10%", "回测和优化"],
        ["组合控制", "单股 35%、每风格 2-5 只", "拟组合和优化"],
        ["再平衡", "corridor 20%、3 个交易日", "月检与到期复核"],
        ["执行误差", "数量、金额、权重容差", "隔日持仓核对"],
    ],
    [39 * mm, 76 * mm, 59 * mm],
))
story.append(Spacer(1, 5 * mm))
story.append(note("如果管理员不维护，系统使用默认值；点击“生效”后才写入后台。每个年度数据包保存当时使用的参数版本和完整快照，后续改参数不会改写历史结果。", "green"))


new_page("24", "三项旧问题的关闭证据", "本页明确说明为什么旧 PDF 不应再用于业务评审。")
story.append(data_table(
    ["旧问题", "修复", "复测证据", "状态"],
    [
        ["熊市债券收益被久期调整压低", "取消未经批准的久期价格变化；使用 4.75% carry", "熊市目标 Beta 回到 1.00，流程跑通", "已关闭"],
        ["优化器只会调权重或只能提示换股", "逐 Sleeve 独立求解，并实现最少 Ticker 更换搜索", "平衡、熊市各生成三套完整通过方案", "已关闭"],
        ["管理员维护项与实际引擎不一致", "表单改为校准期、阈值、网格、边界和风险厌恶等有效参数", "年度运行保存参数 v3 和政策快照", "已关闭"],
    ],
    [48 * mm, 63 * mm, 47 * mm, 16 * mm],
))
story.append(Spacer(1, 6 * mm))
story.append(note("另有一项待改进：角色首页偶尔显示“没有待处理事项”，但年度流程内实际存在可操作按钮。它不影响计算或审批结果，但会影响任务提醒可信度，应在下一步修复。", "amber"))


new_page("25", "三情景正式测试矩阵", "只把真实点击完成的范围标记为通过。")
story.append(data_table(
    ["流程环节", "牛市", "平衡市", "熊市"],
    [
        ["独立账户与首次改密", "通过", "通过", "通过"],
        ["本金、公开数据、目标收益", "通过", "通过", "通过"],
        ["Sleeve、拟组合、真实回测", "通过", "通过", "通过"],
        ["三组优化", "未触发", "通过", "通过"],
        ["委员会组合审批", "通过", "通过", "通过"],
        ["交易 maker-checker", "通过", "通过", "通过"],
        ["进入监控与再平衡", "通过", "通过", "通过"],
        ["持仓、月检、到期复核", "本轮未重复", "本轮未重复", "通过"],
        ["非股票净值、报告、PDF、语言", "本轮未重复", "本轮未重复", "通过"],
    ],
    [70 * mm, 34.7 * mm, 34.7 * mm, 34.6 * mm],
))
story.append(Spacer(1, 6 * mm))
story.append(note("牛市和平衡市复测的停止点是“监控与再平衡”交接，不把未重复的下游步骤写成该情景通过。下游功能由熊市完整端到端测试覆盖。", "gray"))


new_page("A", "公式、数据血缘与业务核对", "业务人员可以用本页逐项复算和追踪来源。")
story.append(data_table(
    ["项目", "公式或口径"],
    [
        ["年度目标", "max(公开数据预期, 运营成本 + CPI)，再限制在情景区间内"],
        ["基准组合收益", "Σ(资产/市场权重 × 参考收益率)"],
        ["股票差额", "max(0, 年度目标 - 基准组合收益)"],
        ["目标 Beta", "(Sleeve 目标收益 - 当地无风险利率) / (市场收益 - 当地无风险利率)"],
        ["实际 Sleeve Beta", "Σ(个股 Sleeve 权重 × 个股相对同市场 benchmark 的 Beta)"],
        ["收益通过", "实际年化收益 >= 目标 × 95%"],
        ["Beta 上限", "实际 Beta <= 目标 Beta × 105%"],
        ["Corridor", "目标权重 × 80% 至目标权重 × 120%"],
        ["归因核对", "市场 + 配置 + 择股 + 交互 + 非股票 = 总收益"],
    ],
    [43 * mm, 131 * mm],
))
story.append(Spacer(1, 5 * mm))
story.append(P("最终业务判断", "CNSub"))
story.append(bullet("三种情景的配置、目标拆解、Sleeve 目标、回测和角色流转已经用独立状态真实验证。"))
story.append(bullet("优化只处理失败 Sleeve，并优先最小改权重；本轮平衡和熊市均不需要换 Ticker。"))
story.append(bullet("熊市逻辑错误、最少换股能力和管理员参数一致性三项已经解决。"))
story.append(bullet("下一步应优先修复首页待办提醒，再决定是否扩展外部数据自动化和长期运行验证。"))


OUTPUT.parent.mkdir(parents=True, exist_ok=True)
doc = IsaterDoc(str(OUTPUT))
doc.build(story)
print(OUTPUT)
