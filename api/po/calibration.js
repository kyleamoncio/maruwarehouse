'use strict';
const {requireAuthenticated}=require('../../lib/auth');
const {readJsonBody,json,safeError}=require('../../lib/api-utils');
const {generateCalibrationPdf,PROVISIONAL_TEMPLATES}=require('../../lib/pdf-documents');
module.exports=async function handler(req,res){
  const user=requireAuthenticated(req,res,'operator');if(!user)return;
  if(req.method!=='POST')return json(res,405,{success:false,error:'Method not allowed.'});
  try{
    const body=await readJsonBody(req),template=PROVISIONAL_TEMPLATES[body.templateId];if(!template)throw new Error('Calibration template was not found.');
    const bytes=Buffer.from(await generateCalibrationPdf(template,body.calibration||{}));res.statusCode=200;res.setHeader('Content-Type','application/pdf');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Disposition',`inline; filename="${body.templateId}-calibration-SAMPLE.pdf"`);res.end(bytes);
  }catch(error){return json(res,500,{success:false,error:safeError(error)});}
};
