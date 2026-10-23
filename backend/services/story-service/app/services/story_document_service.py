from io import BytesIO

from docx import Document
from pypdf import PdfReader


class StoryDocumentService:
    """
    Extract story text from uploaded TXT, DOCX, and PDF files.
    """

    ALLOWED_EXTENSIONS = {".txt", ".docx", ".pdf"}

    @classmethod
    def extract_text(
        cls,
        filename: str,
        file_bytes: bytes,
    ) -> str:
        """
        Extract plain text from a supported story document.
        """

        extension = cls._get_extension(filename)

        if extension not in cls.ALLOWED_EXTENSIONS:
            raise ValueError(
                "Unsupported file type. "
                "Only PDF, DOCX, and TXT files are supported."
            )

        if not file_bytes:
            raise ValueError("Uploaded file is empty.")

        if extension == ".txt":
            text = cls._extract_txt(file_bytes)

        elif extension == ".docx":
            text = cls._extract_docx(file_bytes)

        elif extension == ".pdf":
            text = cls._extract_pdf(file_bytes)

        else:
            raise ValueError("Unsupported file type.")

        text = cls._clean_text(text)

        if not text:
            raise ValueError(
                "No readable text was found in the uploaded file."
            )

        return text

    @staticmethod
    def _get_extension(filename: str) -> str:
        """
        Get the lowercase file extension.
        """

        if not filename or "." not in filename:
            return ""

        return "." + filename.rsplit(".", 1)[1].lower()

    @staticmethod
    def _extract_txt(file_bytes: bytes) -> str:
        """
        Extract text from a TXT file.
        """

        try:
            return file_bytes.decode("utf-8")

        except UnicodeDecodeError:
            return file_bytes.decode(
                "utf-8",
                errors="replace",
            )

    @staticmethod
    def _extract_docx(file_bytes: bytes) -> str:
        """
        Extract paragraphs from a DOCX file.
        """

        document = Document(BytesIO(file_bytes))

        paragraphs = []

        for paragraph in document.paragraphs:
            text = paragraph.text.strip()

            if text:
                paragraphs.append(text)

        return "\n\n".join(paragraphs)

    @staticmethod
    def _extract_pdf(file_bytes: bytes) -> str:
        """
        Extract text from a PDF file.
        """

        reader = PdfReader(BytesIO(file_bytes))

        pages = []

        for page in reader.pages:
            text = page.extract_text()

            if text:
                text = text.strip()

                if text:
                    pages.append(text)

        return "\n\n".join(pages)

    @staticmethod
    def _clean_text(text: str) -> str:
        """
        Normalize extracted text while preserving paragraphs.
        """

        lines = []

        for line in text.splitlines():
            cleaned_line = " ".join(line.split())

            if cleaned_line:
                lines.append(cleaned_line)

        return "\n\n".join(lines).strip()