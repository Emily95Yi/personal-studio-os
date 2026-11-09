"""Build the Share Sheet shortcut; sign its output with macOS shortcuts sign."""
import argparse
from contextlib import contextmanager
from pathlib import Path
import plistlib
from uuid import uuid4

ORIGIN = "https://yistudio-private.cho-eki0915.workers.dev"
BASE = ORIGIN + "/api/capture/mobile"
CAPTURE_PAGE = ORIGIN + "/capture.html"
MISSING_TOKEN = "请粘贴这台 iPhone 的 Studio 设备凭证"
JSON_OBJECT = r'\A\s*\{\s*(?:"[\s\S]*|)\}\s*\z'


def uid():
    return str(uuid4()).upper()


def variable(name):
    return {"Type": "Variable", "VariableName": name}


def reference(value):
    return {"WFSerializationType": "WFTextTokenAttachment", "Value": value}


def text(*parts):
    string = ""
    attachments = {}
    for part in parts:
        if isinstance(part, str):
            string += part
        else:
            offset = len(string.encode("utf-16-le")) // 2
            attachments[f"{{{offset}, 1}}"] = part
            string += "\ufffc"
    value = {"string": string}
    if attachments:
        value["attachmentsByRange"] = attachments
    return {"WFSerializationType": "WFTextTokenString", "Value": value}


def dictionary(fields):
    items = []
    for key, value in fields.items():
        if isinstance(value, dict) and "WFSerializationType" in value:
            encoded = value
            kind = 0
        elif isinstance(value, dict):
            encoded = {"WFSerializationType": "WFDictionaryFieldValue", "Value": dictionary(value)}
            kind = 1
        else:
            encoded = text(value)
            kind = 0
        items.append({"WFKey": text(key), "WFValue": encoded, "WFItemType": kind})
    return {"WFSerializationType": "WFDictionaryFieldValue", "Value": {"WFDictionaryFieldValueItems": items}}


class Workflow:
    def __init__(self):
        self.actions = []

    def action(self, name, **params):
        self.actions.append({
            "WFWorkflowActionIdentifier": "is.workflow.actions." + name,
            "WFWorkflowActionParameters": params,
        })

    def result(self, name, output_name, **params):
        output = uid()
        self.action(name, UUID=output, **params)
        return {"Type": "ActionOutput", "OutputUUID": output, "OutputName": output_name}

    def assign(self, name, value):
        if isinstance(value, str):
            value = self.result("gettext", "Text", WFTextActionText=value)
        self.action("setvariable", WFInput=reference(value), WFVariableName=name)
        return variable(name)

    @contextmanager
    def condition(self, value, test, other=None):
        group = uid()
        params = {}
        if isinstance(other, int):
            params["WFNumberValue"] = other
        elif other is not None:
            params["WFConditionalActionString"] = text(other)
        self.action("conditional", GroupingIdentifier=group, WFControlFlowMode=0, WFCondition=test,
                    WFInput={"Type": "Variable", "Variable": reference(value)}, **params)
        yield lambda: self.action("conditional", GroupingIdentifier=group, WFControlFlowMode=1)
        self.action("conditional", GroupingIdentifier=group, WFControlFlowMode=2, UUID=uid())

    def menu(self, prompt, options):
        group = uid()
        self.action("choosefrommenu", GroupingIdentifier=group, WFControlFlowMode=0, WFMenuPrompt=prompt,
                    WFMenuItems=[{"WFItemType": 0, "WFValue": label} for label, _ in options])
        for label, run in options:
            self.action("choosefrommenu", GroupingIdentifier=group, WFControlFlowMode=1,
                        WFMenuItemTitle=label, WFMenuItemAttributedTitle=label)
            run()
        self.action("choosefrommenu", GroupingIdentifier=group, WFControlFlowMode=2, UUID=uid())

    def ask(self, prompt):
        return self.result("ask", "Provided Input", WFAskActionPrompt=prompt, WFInputType="Text",
                           WFAllowsMultilineText=True, WFAskActionDefaultAnswer="")

    def key(self, value, key):
        return self.result("getvalueforkey", "Dictionary Value", WFInput=reference(value),
                           WFDictionaryKey=key, WFGetDictionaryValueType="Value")

    def match(self, value, pattern):
        return self.result("text.match", "Matches", text=text(value), WFMatchTextPattern=pattern,
                           WFMatchTextCaseSensitive=False)

    def first(self, value):
        return self.result("getitemfromlist", "Item from List", WFInput=reference(value),
                           WFItemSpecifier="First Item")

    def choose(self, value, prompt):
        return self.result("choosefromlist", "Chosen Item", WFInput=reference(value),
                           WFChooseFromListActionPrompt=prompt, WFChooseFromListActionSelectMultiple=False)

    def alert(self, message, stop=False):
        self.action("alert", WFAlertActionTitle="存入奕 Studio", WFAlertActionMessage=message,
                    WFAlertActionCancelButtonShown=False)
        if stop:
            self.action("exit")

    def studio_response(self, response, operation, on_blocked):
        json_object = self.match(response, JSON_OBJECT)
        with self.condition(json_object, 101):
            on_blocked(operation + "。Studio 手机接口可能被 Cloudflare 登录拦截。")
        parsed = self.result("detect.dictionary", "Dictionary", WFInput=reference(response))
        keys = self.result("getvalueforkey", "Keys", WFInput=reference(parsed),
                           WFGetDictionaryValueType="All Keys")
        with self.condition(keys, 99, "error"):
            error = self.key(parsed, "error")
            with self.condition(error, 4, "unauthorized"):
                on_blocked(operation + "。请检查设备凭证是否有效，以及 Studio 手机接口是否已启用。")
            self.alert(text(operation + "（", error, "）。"), stop=True)
        return parsed, keys

    def choose_record(self, rows, prompt):
        with self.condition(rows, 101):
            self.alert("这个分类下没有可用选项。请重新运行，或选「快速保存」。", stop=True)
        group = uid()
        self.action("repeat.each", GroupingIdentifier=group, WFControlFlowMode=0, WFInput=reference(rows))
        label = self.key(variable("Repeat Item"), "label")
        self.result("gettext", "Text", WFTextActionText=text(variable("Repeat Index"), " · ", label))
        labels = self.result("repeat.each", "Repeat Results", GroupingIdentifier=group, WFControlFlowMode=2)
        selection = self.choose(labels, prompt)
        prefix = self.first(self.match(selection, r"^[0-9]+"))
        return self.result("getitemfromlist", "Item from List", WFInput=reference(rows),
                           WFItemSpecifier="Item At Index", WFItemIndex=reference(prefix))


def build():
    wf = Workflow()
    wf.action("comment", WFCommentActionText="本快捷指令只将你选择的内容发往奕 Studio。每台设备使用自己的凭证。")
    token_index = len(wf.actions)
    token = wf.result("gettext", "Text", WFTextActionText=MISSING_TOKEN)
    token_match = wf.match(token, r"^sc_[a-f0-9]{64}$")
    with wf.condition(token_match, 101):
        wf.alert("请先在 Self-board 设置 → Capture Devices 生成这台 iPhone 的凭证，再填入本快捷指令顶部的「文本」动作。", stop=True)

    headers = dictionary({"Authorization": text("Bearer ", token)})
    shortcut_input = {"Type": "ExtensionInput"}
    with wf.condition(shortcut_input, 100) as otherwise:
        count = wf.result("count", "Count", Input=reference(shortcut_input), WFCountType="Items")
        with wf.condition(count, 2, 1) as single:
            wf.assign("收集输入", wf.choose(shortcut_input, "选择一项内容"))
            single()
            wf.assign("收集输入", shortcut_input)
        otherwise()
        wf.menu("你想收集什么？", [
            ("手动输入文字", lambda: wf.assign("收集输入", wf.ask("输入要保存的文字或网址"))),
            ("读取剪贴板", lambda: wf.assign("收集输入", wf.result("getclipboard", "Clipboard"))),
            ("选择照片", lambda: wf.assign("收集输入", wf.result("selectphoto", "Photos", WFSelectMultiplePhotos=False))),
            ("选择文件", lambda: wf.assign("收集输入", wf.result("file.select", "File", SelectMultiple=False))),
            ("大文件网页上传", lambda: (wf.action("openurl", WFInput=CAPTURE_PAGE), wf.action("exit"))),
        ])
    # File Request points at a file-capable action output, not a text token.
    selected = wf.first(variable("收集输入"))
    with wf.condition(selected, 101):
        wf.alert("没有收到可保存的内容。", stop=True)
    original = wf.assign("原文", "")
    source = wf.assign("来源网址", "")
    page_title = wf.assign("网页标题", "")
    attachment = wf.assign("附件编号", "")
    target = wf.assign("目标分类", "")
    note = wf.assign("个人备注", "")

    kind = wf.result("getitemtype", "Type", WFInput=reference(selected))
    safari = wf.match(kind, r"Safari|网页|網頁|ウェブページ|web page")
    textual = wf.match(kind, r"^(?:.*text|urls?|文本|纯文本|文字|富文本|純文字|格式化文字|テキスト|リッチテキスト|链接|連結|網址|网址)$")
    binary = wf.match(kind, r"image|photo|pdf|file|document|照片|图像|圖像|图片|圖片|文件|文稿|檔案|画像|ファイル|書類")
    with wf.condition(safari, 100) as otherwise:
        url = wf.result("properties.safariwebpage", "Page URL", WFInput=reference(selected),
                        WFContentItemPropertyName="Page URL")
        title = wf.result("properties.safariwebpage", "Name", WFInput=reference(selected),
                          WFContentItemPropertyName="Name")
        wf.assign("来源网址", url)
        wf.assign("网页标题", title)
        content_type = wf.assign("内容类型", "url")
        selection = wf.result("properties.safariwebpage", "Page Selection", WFInput=reference(selected),
                              WFContentItemPropertyName="Page Selection")
        with wf.condition(selection, 100):
            excerpt = wf.result("detect.text", "Text", WFInput=reference(selection))
            wf.assign("原文", excerpt)
            wf.assign("内容类型", "text")
        otherwise()
        with wf.condition(textual, 101):
            with wf.condition(binary, 101):
                wf.menu("请选择分享内容的类型", [
                    ("文字或网址", lambda: wf.assign("识别为文字", "yes")),
                    ("图片、PDF 或文件", lambda: wf.assign("识别为文字", "no")),
                ])
        with wf.condition(textual, 100):
            wf.assign("识别为文字", "yes")
        with wf.condition(binary, 100):
            wf.assign("识别为文字", "no")
        with wf.condition(variable("识别为文字"), 4, "yes") as other_type:
            plain = wf.result("detect.text", "Text", WFInput=reference(selected))
            link = wf.match(plain, r"(?i)\A\s*https?://[^\s]+\s*\z")
            with wf.condition(link, 100) as not_url:
                wf.assign("来源网址", plain)
                wf.assign("内容类型", "url")
                not_url()
                wf.assign("原文", plain)
                wf.assign("内容类型", "text")
            other_type()
            wf.assign("内容类型", "upload")

    def blocked(operation):
        with wf.condition(source, 100):
            def open_capture():
                wf.action("setclipboard", WFInput=reference(source), WFLocalOnly=True)
                wf.action("openurl", WFInput=CAPTURE_PAGE)

            wf.menu(operation + " 可复制链接并打开网页，登录后把链接粘贴到「原始网址」再保存。", [
                ("复制链接并打开网页", open_capture),
                ("关闭", lambda: wf.action("nothing")),
            ])
            wf.action("exit")
        wf.alert(operation + " 请稍后重试，或打开 Studio 网页保存。", stop=True)

    def organize():
        response = wf.result("downloadurl", "Contents of URL", WFURL=BASE + "/options", WFHTTPMethod="GET",
                             WFHTTPHeaders=headers)
        parsed, _ = wf.studio_response(response, "未能读取分类", blocked)
        modules = wf.key(parsed, "modules")
        module = wf.choose_record(modules, "选择模块")
        group = wf.choose_record(wf.key(module, "groups"), "选择分组")
        chosen = wf.choose_record(wf.key(group, "options"), "选择分类")
        wf.assign("目标分类", wf.key(chosen, "target"))
        wf.menu("需要写备注吗？", [
            ("填写备注", lambda: wf.assign("个人备注", wf.ask("输入个人备注"))),
            ("跳过", lambda: wf.action("nothing")),
        ])

    wf.menu("选择保存方式", [
        ("快速保存 · Inbox", lambda: wf.action("nothing")),
        ("选择分类", organize),
    ])
    random = [wf.result("number.random", "Random Number", WFRandomNumberMinimum=100000000,
                        WFRandomNumberMaximum=999999999) for _ in range(2)]
    request_key = wf.result("gettext", "Text", WFTextActionText=text(random[0], "-", random[1]))
    with wf.condition(content_type, 4, "upload"):
        filename = wf.result("getitemname", "Name", WFInput=reference(selected))
        safe_name = wf.result("urlencode", "URL Encoded Text", WFInput=text(filename), WFEncodeMode="Encode")
        upload = wf.result("downloadurl", "Contents of URL",
                           WFURL=text(BASE + "/uploads/single?id=", request_key, "&filename=", safe_name),
                           WFHTTPMethod="POST", WFHTTPHeaders=headers, WFHTTPBodyType="File",
                           WFRequestVariable=reference(selected))
        parsed, _ = wf.studio_response(upload, "附件上传未确认", blocked)
        upload_id = wf.key(parsed, "id")
        with wf.condition(upload_id, 101):
            wf.alert("附件上传未确认。超过 8 MiB 的文件请使用「大文件网页上传」。", stop=True)
        wf.assign("附件编号", upload_id)
        wf.assign("内容类型", wf.key(parsed, "type"))

    response = wf.result("downloadurl", "Contents of URL", WFURL=BASE, WFHTTPMethod="POST", WFHTTPHeaders=headers,
                         WFHTTPBodyType="JSON", WFJSONValues=dictionary({
                             "requestKey": text(request_key), "type": text(content_type), "sourceUrl": text(source),
                             "originalText": text(original), "userNote": text(note), "target": text(target),
                             "attachmentId": text(attachment), "metadata": {"pageTitle": text(page_title)},
                         }))
    parsed, keys = wf.studio_response(response, "Studio 未确认保存", blocked)
    with wf.condition(keys, 999, "id"):
        wf.alert("Studio 未确认保存。请检查网络和设备授权，或在 Inbox 核对。", stop=True)
    with wf.condition(keys, 99, "classificationError"):
        wf.alert("已存入 Inbox，分类未完成。可在 Self-board 里继续整理。", stop=True)
    with wf.condition(keys, 99, "duplicate"):
        wf.alert("已存在，Studio 保留了原有记录。", stop=True)
    saved_status = wf.key(parsed, "status")
    with wf.condition(saved_status, 4, "organized"):
        wf.alert("已存入奕 Studio · 已分类", stop=True)
    with wf.condition(saved_status, 4, "inbox"):
        wf.alert("已存入奕 Studio · Inbox", stop=True)
    wf.alert("Studio 返回了未知状态，请在 Inbox 核对。")

    return {
        "WFWorkflowClientVersion": "3032.0.4",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowHasShortcutInputVariables": True,
        "WFWorkflowInputContentItemClasses": [
            "WFURLContentItem", "WFSafariWebPageContentItem", "WFStringContentItem", "WFRichTextContentItem",
            "WFImageContentItem", "WFPDFContentItem", "WFGenericFileContentItem",
        ],
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowImportQuestions": [{
            "Category": "Parameter", "ActionIndex": token_index, "ParameterKey": "WFTextActionText",
            "Text": "粘贴 Self-board 设置为这台 iPhone 生成的设备凭证（sc_ 开头）。",
            "DefaultValue": MISSING_TOKEN,
        }],
        "WFWorkflowTypes": ["ActionExtension"],
        "WFWorkflowIcon": {"WFWorkflowIconStartColor": 431817727, "WFWorkflowIconGlyphNumber": 59754},
        "WFWorkflowActions": wf.actions,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    with args.output.open("wb") as output:
        plistlib.dump(build(), output, fmt=plistlib.FMT_BINARY)
