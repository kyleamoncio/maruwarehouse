(function(root,factory){
  if(typeof module==='object'&&module.exports){module.exports=factory(require('pdf-lib'));}
  else{root.SummaryReport=factory(root.PDFLib);}
})(typeof self!=='undefined'?self:this,function(PDFLib){
  'use strict';

  const SUMMARY_REPORT_COLUMNS=Object.freeze([
    {key:'date',label:'DATE',width:90},
    {key:'buyers',label:'BUYER',width:120},
    {key:'po',label:'PO #',width:85},
    {key:'si',label:'SI #',width:75},
    {key:'items',label:'ITEMS',width:290},
    {key:'total',label:'TOTAL',width:110,align:'right'},
  ]);
  let previewUrl='';
  let previewRows=[];

  function stripHtml(value){
    return String(value==null?'':value).replace(/<br\s*\/?\s*>/gi,', ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
  }
  function normalizeRows(rows){
    return (Array.isArray(rows)?rows:[]).map(row=>({
      date:stripHtml(row.date)||'—',
      buyers:stripHtml(row.buyerText||row.buyers)||'—',
      po:stripHtml(row.poText||row.po)||'—',
      si:stripHtml(row.siText||row.si)||'—',
      items:stripHtml(row.itemText||row.items)||'—',
      total:Number(row.total)||0,
    }));
  }
  function money(value){return 'PHP '+(Number(value)||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function wrapText(text,font,size,maxWidth){
    const words=String(text||'—').split(/\s+/).filter(Boolean);
    const lines=[];
    let line='';
    words.forEach(word=>{
      const candidate=line?line+' '+word:word;
      if(font.widthOfTextAtSize(candidate,size)<=maxWidth){line=candidate;return;}
      if(line)lines.push(line);
      if(font.widthOfTextAtSize(word,size)<=maxWidth){line=word;return;}
      let chunk='';
      Array.from(word).forEach(character=>{
        const next=chunk+character;
        if(font.widthOfTextAtSize(next,size)>maxWidth&&chunk){lines.push(chunk);chunk=character;}else chunk=next;
      });
      line=chunk;
    });
    if(line)lines.push(line);
    return lines.length?lines:['—'];
  }
  async function buildPdfBytes(rows,options={}){
    if(!PDFLib||!PDFLib.PDFDocument)throw new Error('PDF library is not available.');
    const data=normalizeRows(rows);
    if(!data.length)throw new Error('Select at least one Summary row.');
    const {PDFDocument,StandardFonts,rgb}=PDFLib;
    const pdf=await PDFDocument.create();
    const regular=await pdf.embedFont(StandardFonts.Helvetica);
    const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
    const pageSize=[841.89,595.28];
    const margin=36;
    const tableWidth=SUMMARY_REPORT_COLUMNS.reduce((sum,column)=>sum+column.width,0);
    const headerHeight=25;
    const fontSize=8.2;
    const lineHeight=10.5;
    let page,y;

    function addPage(){
      page=pdf.addPage(pageSize);
      y=pageSize[1]-margin;
      page.drawText('MARU Sales Summary',{x:margin,y:y-4,size:18,font:bold,color:rgb(.10,.11,.10)});
      y-=30;
      page.drawRectangle({x:margin,y:y-headerHeight,width:tableWidth,height:headerHeight,color:rgb(.13,.14,.13)});
      let x=margin;
      SUMMARY_REPORT_COLUMNS.forEach(column=>{
        const labelWidth=bold.widthOfTextAtSize(column.label,8);
        const labelX=column.align==='right'?x+column.width-8-labelWidth:x+8;
        page.drawText(column.label,{x:labelX,y:y-16,size:8,font:bold,color:rgb(1,1,1)});
        x+=column.width;
      });
      y-=headerHeight;
    }
    addPage();
    data.forEach(row=>{
      const wrapped=SUMMARY_REPORT_COLUMNS.map(column=>wrapText(column.key==='total'?money(row.total):row[column.key],regular,fontSize,column.width-12));
      const rowHeight=Math.max(24,Math.max(...wrapped.map(lines=>lines.length))*lineHeight+10);
      if(y-rowHeight<margin+12)addPage();

      page.drawLine({start:{x:margin,y:y-rowHeight},end:{x:margin+tableWidth,y:y-rowHeight},thickness:.45,color:rgb(.80,.82,.80)});
      let x=margin;
      SUMMARY_REPORT_COLUMNS.forEach((column,columnIndex)=>{
        const lines=wrapped[columnIndex];
        lines.forEach((line,lineIndex)=>{
          const textWidth=regular.widthOfTextAtSize(line,fontSize);
          const textX=column.align==='right'?x+column.width-6-textWidth:x+6;
          page.drawText(line,{x:textX,y:y-14-lineIndex*lineHeight,size:fontSize,font:regular,color:rgb(.13,.14,.13)});
        });
        x+=column.width;
      });
      y-=rowHeight;
    });
    const grandTotal=data.reduce((sum,row)=>sum+(Number(row.total)||0),0);
    const grandTotalHeight=30;
    if(y-grandTotalHeight<margin+12)addPage();
    const totalColumn=SUMMARY_REPORT_COLUMNS[SUMMARY_REPORT_COLUMNS.length-1];
    const totalX=margin+SUMMARY_REPORT_COLUMNS.slice(0,-1).reduce((sum,column)=>sum+column.width,0);
    const totalText=money(grandTotal);
    const labelWidth=bold.widthOfTextAtSize('GRAND TOTAL',9);
    const totalWidth=bold.widthOfTextAtSize(totalText,9);
    page.drawLine({start:{x:totalX-130,y:y-4},end:{x:margin+tableWidth,y:y-4},thickness:.8,color:rgb(.35,.37,.35)});
    page.drawText('GRAND TOTAL',{x:totalX-10-labelWidth,y:y-22,size:9,font:bold,color:rgb(.10,.11,.10)});
    page.drawText(totalText,{x:margin+tableWidth-6-totalWidth,y:y-22,size:9,font:bold,color:rgb(.10,.11,.10)});
    return pdf.save({useObjectStreams:false});
  }
  async function makeBlob(rows){return new Blob([await buildPdfBytes(rows)],{type:'application/pdf'});}
  function closePreview(){
    const modal=document.getElementById('summaryPdfModal');
    const frame=document.getElementById('summaryPdfFrame');
    if(modal){modal.classList.remove('is-open');modal.setAttribute('aria-hidden','true');}
    if(frame)frame.removeAttribute('src');
    if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}
    previewRows=[];
  }
  async function preview(rows){
    previewRows=normalizeRows(rows);
    const blob=await makeBlob(previewRows);
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    previewUrl=URL.createObjectURL(blob);
    const frame=document.getElementById('summaryPdfFrame');
    const modal=document.getElementById('summaryPdfModal');
    if(!frame||!modal)throw new Error('PDF preview panel is unavailable.');
    frame.src=previewUrl;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden','false');
  }
  async function download(rows,fileName){
    const data=normalizeRows(rows&&rows.length?rows:previewRows);
    const blob=await makeBlob(data);
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download=fileName||`maru-summary-${new Date().toISOString().slice(0,10)}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return {SUMMARY_REPORT_COLUMNS,normalizeRows,buildPdfBytes,preview,download,closePreview};
});
