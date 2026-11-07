"""Build the native workflow. Sign the resulting file with Apple's shortcuts CLI."""
import argparse
from pathlib import Path
import plistlib
from uuid import uuid4


def identifier():
    return str(uuid4()).upper()


def attachment(kind, **fields):
    return {"WFSerializationType": "WFTextTokenAttachment", "Value": {"Type": kind, **fields}}


def token_text(value, prefix=""):
    offset = len(prefix.encode("utf-16-le")) // 2
    return {
        "WFSerializationType": "WFTextTokenString",
        "Value": {
            "string": prefix + "\ufffc",
            "attachmentsByRange": {f"{{{offset}, 1}}": value["Value"]},
        },
    }


def build():
    actions = []

    def action(name, **params):
        actions.append({
            "WFWorkflowActionIdentifier": "is.workflow.actions." + name,
            "WFWorkflowActionParameters": params,
        })

    def capture(name, output_name, **params):
        uid = identifier()
        action(name, UUID=uid, **params)
        return attachment("ActionOutput", OutputUUID=uid, OutputName=output_name)

    def if_value(value, operation):
        group = identifier()
        action("conditional", GroupingIdentifier=group, WFControlFlowMode=0, WFCondition=operation,
               WFInput={"Type": "Variable", "Variable": value})
        return group

    def end_if(group):
        action("conditional", GroupingIdentifier=group, WFControlFlowMode=2, UUID=identifier())

    dictionary = capture("detect.dictionary", "Dictionary", WFInput=attachment("ExtensionInput"))
    fields = {}
    for key in ("eventId", "title", "start", "end", "allDay", "location", "notes"):
        fields[key] = capture("getvalueforkey", key, WFInput=dictionary,
                              WFDictionaryKey=key, WFGetDictionaryValueType="Value")

    for key in ("eventId", "title", "start", "end"):
        group = if_value(fields[key], 101)
        action("exit")
        end_if(group)

    marker = token_text(fields["eventId"], "YiStudio-Event-ID: ")
    matching = capture(
        "filter.calendarevents", "Calendar Events",
        WFContentItemFilter={
            "WFSerializationType": "WFContentPredicateTableTemplate",
            "Value": {
                "WFActionParameterFilterPrefix": 1,
                "WFContentPredicateBoundedDate": False,
                "WFActionParameterFilterTemplates": [
                    {"Property": "Notes", "Operator": 99, "Removable": True,
                     "Values": {"String": marker, "Unit": 4}},
                ],
            },
        },
        WFContentItemLimitEnabled=True, WFContentItemLimitNumber=1,
    )
    duplicate = if_value(matching, 100)
    action("output", WFOutput="existing")
    end_if(duplicate)

    # The Calendar action uses the calendar selected in the editor or the device default.
    action(
        "addnewevent", WFCalendarItemTitle=token_text(fields["title"]),
        WFCalendarItemStartDate=token_text(fields["start"]),
        WFCalendarItemEndDate=token_text(fields["end"]),
        WFCalendarItemLocation=token_text(fields["location"]),
        WFCalendarItemNotes=token_text(fields["notes"]),
        WFCalendarItemAllDay=fields["allDay"], WFCalendarItemDates=True, ShowWhenRun=False,
    )
    action("output", WFOutput="added")
    return {
        "WFWorkflowClientVersion": "3032.0.4",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowHasShortcutInputVariables": True,
        "WFWorkflowInputContentItemClasses": ["WFStringContentItem"],
        "WFWorkflowOutputContentItemClasses": ["WFStringContentItem"],
        "WFWorkflowImportQuestions": [],
        "WFWorkflowTypes": [],
        "WFWorkflowNoInputBehavior": {
            "Name": "WFWorkflowNoInputBehaviorShowError",
            "Parameters": {"Error": "请从奕Studio打开此快捷指令。"},
        },
        "WFWorkflowIcon": {"WFWorkflowIconStartColor": 431817727, "WFWorkflowIconGlyphNumber": 59754},
        "WFWorkflowActions": actions,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    with args.output.open("wb") as target:
        plistlib.dump(build(), target, fmt=plistlib.FMT_BINARY)
