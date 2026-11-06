"""Source-grounded normalization shared by document and interview capture."""
import re


def number_words(number: int) -> str:
    small = ("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen "
             "sixteen seventeen eighteen nineteen").split()
    if number < 20:
        return small[number]
    if number < 100:
        tens = ("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")
        return tens[number // 10] + (" " + small[number % 10] if number % 10 else "")
    if number < 1000:
        return small[number // 100] + " hundred" + (" " + number_words(number % 100) if number % 100 else "")
    return "one thousand"


def supported_count(value: str, text: str, basis: str, field_id: str) -> bool:
    if not re.fullmatch(r"[0-9]+", value):
        return False
    text = text.lower()
    if basis == "literal":
        return bool(re.search(r"(?<![\d.])" + re.escape(value) + r"(?!\d|\.\d|\s*[-\u2013]\s*\d)", text))
    number = int(value)
    if basis == "number_words":
        normalized = re.sub(r"\s+", " ", text.replace("-", " "))
        words = ("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen "
                 "sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand").split()
        token = "(?:" + "|".join(words) + ")"
        phrases = re.findall(r"\b" + token + r"(?:\s+(?:and\s+)?" + token + r")*\b", normalized)
        return number <= 1000 and number_words(number) in [phrase.replace(" and ", " ") for phrase in phrases]
    if field_id != "fact.decision_points":
        return False
    ordinals = ("first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth")
    observed = {index + 1 for index, word in enumerate(ordinals)
                if re.search(r"\b" + word + r"\s+(?:formal\s+)?(?:human\s+)?decision point\b", text)}
    return 0 < number <= len(ordinals) and observed == set(range(1, number + 1))


def explicit_option(option: str, text: str) -> bool:
    pattern = re.escape(option).replace("_", r"[\s_-]+")
    return bool(re.search(r"(?<![\w-])" + pattern + r"(?![\w-])", text, re.IGNORECASE))


def exact_count(text: str) -> str | None:
    normalized = re.sub(r"\s+", " ", text.lower().replace("-", " ")).strip().rstrip(".")
    if re.fullmatch(r"[0-9]+", normalized):
        return normalized.lstrip("0") or "0"
    return next((str(number) for number in range(1001)
                 if number_words(number) == normalized.replace(" and ", " ")), None)
