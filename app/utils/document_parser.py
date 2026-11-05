"""Bounded text-only parsers, run in a disposable process for uploaded files."""
from io import BytesIO
import json
import sys
from zipfile import ZipFile, BadZipFile

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_TEXT = 40000
MAX_UNITS = 200


def parse_document(data: bytes, kind: str) -> dict:
    if not data or len(data) > MAX_FILE_BYTES:
        raise ValueError("Upload one nonempty file, up to 5 MiB.")
    units, warnings = [], []

    def append(location, text):
        text = text.strip()
        if text:
            units.append({"location": location, "text": text})
            if len(units) > MAX_UNITS or sum(len(unit["text"]) for unit in units) > MAX_TEXT:
                raise ValueError("This document exceeds 40,000 extracted characters or 200 source sections. Upload a focused excerpt.")

    if kind == "pdf":
        from pypdf import PdfReader, apply_configuration
        from pypdf.errors import PdfReadError, LimitReachedError, DependencyError
        if not data.startswith(b"%PDF-"):
            raise ValueError("The file contents do not match a PDF.")
        try:
            with apply_configuration(
                maximum_declared_stream_length=4_000_000, array_based_stream_maximum_output_length=4_000_000,
                zlib_maximum_output_length=4_000_000, lzw_maximum_output_length=4_000_000,
                run_length_maximum_output_length=4_000_000, brotli_maximum_output_length=4_000_000,
                stream_decoding_work_maximum_length=8_000_000, stream_parsing_work_maximum_count=100_000,
                dictionary_maximum_element_count=5000, array_maximum_element_count=5000,
                page_tree_maximum_entries=500, page_tree_maximum_depth=30,
                xform_maximum_invocations_per_extraction=100, jbig2dec_binary=None,
            ):
                reader = PdfReader(BytesIO(data), strict=True)
                if reader.is_encrypted:
                    raise ValueError("Encrypted PDFs are not supported. Upload an unencrypted copy you are authorized to share.")
                if len(reader.pages) > 50:
                    raise ValueError("PDFs are limited to 50 pages. Upload a focused excerpt.")
                empty = []
                for index, page in enumerate(reader.pages, 1):
                    contents = page.get_contents()
                    if contents is not None and len(contents.get_data()) > 4_000_000:
                        raise ValueError("This PDF exceeds safe parsing limits. Upload a focused excerpt.")
                    text = page.extract_text()
                    if not text.strip():
                        empty.append(index)
                    append(f"Page {index}", text)
                if empty and units:
                    warnings.append("No searchable text on pages " + ", ".join(map(str, empty)) +
                                    ". Check whether those pages need OCR; they were not interpreted.")
                count = len(reader.pages)
        except (PdfReadError, LimitReachedError, DependencyError, NotImplementedError, RecursionError) as exc:
            raise ValueError("This PDF is malformed or exceeds safe parsing limits. Upload a simpler searchable copy.") from exc
    elif kind == "docx":
        from defusedxml.ElementTree import fromstring
        from defusedxml.common import DefusedXmlException
        from xml.etree.ElementTree import ParseError
        if not data.startswith(b"PK\x03\x04"):
            raise ValueError("The file contents do not match a DOCX.")
        try:
            with ZipFile(BytesIO(data)) as archive:
                entries = archive.infolist()
                names = [entry.filename for entry in entries]
                if (len(entries) > 1000 or len(set(names)) != len(names) or
                        sum(entry.file_size for entry in entries) > 12 * 1024 * 1024 or
                        any(entry.flag_bits & 1 or entry.compress_type not in (0, 8) or
                            ".." in entry.filename.split("/") or entry.filename.startswith("/") for entry in entries)):
                    raise ValueError("This DOCX is encrypted or exceeds safe package limits.")
                if any(name.lower().endswith("vbaproject.bin") for name in names):
                    raise ValueError("Macro-enabled documents are not supported. Upload a plain DOCX.")
                if not {"[Content_Types].xml", "word/document.xml"}.issubset(names):
                    raise ValueError("This file is not a standard DOCX package.")
                if archive.getinfo("[Content_Types].xml").file_size > 65536 or archive.getinfo("word/document.xml").file_size > 4_000_000:
                    raise ValueError("This DOCX exceeds safe XML limits. Upload a focused excerpt.")
                types = fromstring(archive.read("[Content_Types].xml"), forbid_dtd=True)
                expected = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
                if not any(item.attrib.get("PartName") == "/word/document.xml" and
                           item.attrib.get("ContentType") == expected for item in types):
                    raise ValueError("Only plain DOCX documents are supported.")
                root = fromstring(archive.read("word/document.xml"), forbid_dtd=True)
                namespaces = ("http://schemas.openxmlformats.org/wordprocessingml/2006/main",
                              "http://purl.oclc.org/ooxml/wordprocessingml/main")
                namespace = next((value for value in namespaces if root.tag == "{" + value + "}document"), None)
                if namespace is None:
                    raise ValueError("This DOCX uses an unsupported document namespace.")
                ns = "{" + namespace + "}"
                body = root.find(ns + "body")
                if body is None:
                    raise ValueError("This DOCX has no supported document body.")
                def children(element, tags):
                    for child in element:
                        if child.tag in {ns + tag for tag in tags}:
                            yield child
                        elif child.tag in {ns + tag for tag in ("sdt", "sdtContent", "customXml")}:
                            yield from children(child, tags)

                def text_of(paragraph):
                    return "".join(node.text or "" if node.tag == ns + "t" else
                                   "\t" if node.tag == ns + "tab" else "\n"
                                   for node in paragraph.iter()
                                   if node.tag in {ns + tag for tag in ("t", "tab", "br", "cr")})

                paragraph, table = 0, 0
                for index, item in enumerate(children(body, ("p", "tbl")), 1):
                    if index > MAX_UNITS:
                        raise ValueError("DOCX files are limited to 200 main-body sections. Upload a focused excerpt.")
                    if item.tag == ns + "p":
                        paragraph += 1
                        append(f"Paragraph {paragraph}", text_of(item))
                    elif item.tag == ns + "tbl":
                        table += 1
                        for row_index, row in enumerate(children(item, ("tr",)), 1):
                            cells = [" ".join(text_of(p) for p in cell.iter(ns + "p"))
                                     for cell in children(row, ("tc",))]
                            append(f"Table {table}, row {row_index}", " | ".join(cells))
                count = paragraph + table
                warnings.append("DOCX analysis reads main-body paragraphs and tables only. Images, headers, footers, comments and embedded files are not analyzed.")
        except (BadZipFile, ParseError, DefusedXmlException, RecursionError) as exc:
            raise ValueError("This DOCX is malformed or contains unsafe XML. Upload a plain, simpler copy.") from exc
    else:
        raise ValueError("Only searchable PDF and DOCX files are supported.")
    if not units:
        raise ValueError("No searchable text was found. Image-only or scanned files need OCR before upload.")
    return {"units": units, "source_count": count, "warnings": warnings}


def main():
    # Production Linux workers have an additional process-wide memory ceiling.
    if sys.platform != "win32":
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
    try:
        result = parse_document(sys.stdin.buffer.read(MAX_FILE_BYTES + 1), sys.argv[1])
    except (ValueError, MemoryError) as exc:
        result = {"error": str(exc) if isinstance(exc, ValueError) else "The document exceeded the reader's memory limit."}
    sys.stdout.write(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
